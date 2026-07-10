using Application.Common.Interfaces;
using Application.Rag;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.AI.Evaluation;
using Microsoft.Extensions.Logging;
using TextStack.Ai.Core;
using TextStack.Ai.Evals;
using TextStack.Ai.Llm;
using TextStack.Ai.Rag;

namespace TextStack.Ai.EvalSuite;

/// <summary>One transcribed page's outcome — the fidelity judge score + whether its golden table survived chunking whole.</summary>
public sealed record PdfVisionPageCase(int Page, bool Transcribed, double JudgeScore, bool TableSurvived);

/// <summary>One Q&amp;A's outcome — the answer-fidelity judge score, whether the answer cited the expected page, and the cited page(s).</summary>
public sealed record PdfVisionQaCase(
    string Question, int ExpectedPage, double AnswerScore, bool CitedExpectedPage, IReadOnlyList<int> CitedPages, bool Insufficient);

/// <summary>
/// Result of a PDF vision-RAG eval (ADR-012 S3). Four axes — the DoD gate:
/// <see cref="Transcription"/> (page Markdown vs golden table facts, 1–5 judge mean, ≥4.0),
/// <see cref="Answer"/> (QA answer vs expected facts, 1–5 judge mean, ≥4.0),
/// <see cref="Citation"/> (fraction of answers citing the expected page, deterministic, ≥0.8),
/// <see cref="TableStructure"/> (golden tables survive <see cref="MarkdownChunker"/> whole, deterministic, =1.0).
/// <see cref="Note"/> is set only on the empty-transcription short-circuit (no judge call was made).
/// </summary>
public sealed record PdfVisionEvalResult(
    double Transcription,
    double Answer,
    double Citation,
    double TableStructure,
    int PageN,
    int QaN,
    IReadOnlyList<PdfVisionPageCase> PageCases,
    IReadOnlyList<PdfVisionQaCase> QaCases,
    string? Note);

/// <summary>
/// The ADR-012 S3 vision-RAG DoD gate — self-contained, in-process, no seeded prod book or DB pollution.
/// Over the embedded SYNTHETIC table-page fixtures (original content, no copyrighted material) it runs the
/// EXACT prod pipeline seams:
/// <list type="number">
///   <item>transcribe each fixture page through the gateway <c>pdf.parse</c> route (→ gpt-4.1) with the
///   shared <see cref="PdfVisionPrompt"/> — same prompt prod ships, no drift;</item>
///   <item>fidelity-judge each page's Markdown against its golden table facts (LLM-as-judge, 1–5) →
///   <c>pdfvision.transcription</c>;</item>
///   <item>chunk the pages with the production <see cref="MarkdownChunker"/> and assert each golden table's
///   rows land in ONE chunk → <c>pdfvision.tablestructure</c> (deterministic);</item>
///   <item>embed chunks + questions via <see cref="IEmbeddingService"/>, cosine top-k, stamp
///   <c>SourcePage</c> from the chunk EXACTLY as <c>RagService</c> does, then answer via the real
///   <see cref="IRagAskService.AskFromChunksAsync"/>;</item>
///   <item>judge each answer against its expected facts → <c>pdfvision.answer</c>, and check the answer
///   cited the expected page → <c>pdfvision.citation</c> (deterministic).</item>
/// </list>
/// Empty transcription for EVERY page → short-circuit: NO judge call, persist failed 0-rows with a note
/// (mirrors the catalog "no-LLM-on-empty" invariant). Persists the four <c>pdfvision.*</c>
/// <see cref="EvalRun"/> rows. Admin-triggered only — never scheduled.
/// </summary>
public sealed class PdfVisionEvalRunner(ILogger<PdfVisionEvalRunner> logger)
{
    public const string TranscriptionFeature = "pdfvision.transcription";
    public const string AnswerFeature = "pdfvision.answer";
    public const string CitationFeature = "pdfvision.citation";
    public const string TableStructureFeature = "pdfvision.tablestructure";

    // Transcription runs on the vision route; answers on the Ask route. Deterministic axes carry no judge.
    private const string VisionModelId = "pdf.parse";
    private const string ChunkerModelId = "markdown-chunker";
    private const string NoJudge = CitationJudge.NoJudge;

    // The vision route the parser uses in prod (Infrastructure.Rag.PdfVisionParser.FeatureTag) — kept in
    // sync here since EvalSuite can't reference Infrastructure.
    private const string VisionFeatureTag = "pdf.parse";

    private static readonly ChatMessage[] JudgePlaceholderMessages = [new ChatMessage(ChatRole.User, string.Empty)];

    // Fact-based fidelity rubric for a transcribed page vs its golden table facts.
    private static readonly Rubric TranscriptionRubric = new(
        "coverage: does the transcription contain the specific table facts/values listed, not paraphrased away?",
        "structure: is the table rendered as a proper GitHub-flavored Markdown table (header, |---| delimiter, aligned rows)?",
        "fidelity: are the transcribed values accurate — no altered numbers, swapped cells, or invented content?");

    // Fact-based rubric for a QA answer vs its expected facts (answer must state the cell the question targets).
    private static readonly Rubric AnswerRubric = new(
        "correctness: does the answer state the specific fact the question asks for, matching the source table cell?",
        "grounding: is the answer supported by the page content — no facts invented beyond the table?",
        "relevance: does the answer directly and concisely address the question asked?");

    public async Task<PdfVisionEvalResult> RunAsync(
        ILlmService vision,
        IEmbeddingService embedder,
        IRagAskService ask,
        ILlmService judge,
        string judgeModelId,
        int k,
        bool persist,
        IAppDbContext? db,
        string? gitSha,
        CancellationToken ct)
    {
        var golden = PdfVisionGoldenSet.Load();

        // 1) Transcribe each fixture page through the gateway pdf.parse route with the shared prompt.
        var pages = new List<PdfPageMarkdown>(golden.Pages.Count);
        foreach (var page in golden.Pages)
        {
            ct.ThrowIfCancellationRequested();
            var markdown = await TranscribeAsync(vision, page.ImageResource, ct);
            if (!string.IsNullOrWhiteSpace(markdown))
                pages.Add(new PdfPageMarkdown(page.Page, markdown));
        }

        // Empty for EVERY page → short-circuit: NO judge call (mirrors the catalog no-LLM-on-empty invariant).
        if (pages.Count == 0)
        {
            const string note = "Vision transcription produced no pages (no valid key / no vision output) — no judge call made.";
            logger.LogInformation("PDF vision eval skipped — transcription produced no pages");
            if (persist && db is not null)
            {
                db.EvalRuns.Add(CitationJudge.MakeRun(TranscriptionFeature, VisionModelId, judgeModelId, 0m, 0, gitSha,
                    "{\"note\":\"empty-transcription\",\"pages\":0}"));
                db.EvalRuns.Add(CitationJudge.MakeRun(AnswerFeature, RagAskService.FeatureTag, judgeModelId, 0m, 0, gitSha,
                    "{\"note\":\"empty-transcription\"}"));
                db.EvalRuns.Add(CitationJudge.MakeRun(CitationFeature, RagAskService.FeatureTag, NoJudge, 0m, 0, gitSha,
                    "{\"note\":\"empty-transcription\"}"));
                db.EvalRuns.Add(CitationJudge.MakeRun(TableStructureFeature, ChunkerModelId, NoJudge, 0m, 0, gitSha,
                    "{\"note\":\"empty-transcription\"}"));
                await db.SaveChangesAsync(ct);
            }
            return new PdfVisionEvalResult(0, 0, 0, 0, 0, 0, [], [], note);
        }

        var chatConfig = new ChatConfiguration(new LlmServiceChatClient(judge, defaultFeatureTag: "eval.judge"));
        var producedPages = pages.Select(p => p.Page).ToHashSet();

        // 2) Chunk with the production structure-aware chunker (drives tablestructure + retrieval).
        var chunks = new MarkdownChunker().Chunk(pages);

        // 3) Per-page: fidelity judge (transcription) + deterministic table-survival check (tablestructure).
        var pageCases = new List<PdfVisionPageCase>(golden.Pages.Count);
        var transcriptionScores = new List<double>();
        var tablesSurvived = 0;
        foreach (var page in golden.Pages)
        {
            ct.ThrowIfCancellationRequested();
            var markdown = pages.FirstOrDefault(p => p.Page == page.Page).Markdown;
            var transcribed = producedPages.Contains(page.Page) && !string.IsNullOrWhiteSpace(markdown);

            var survived = transcribed && TableSurvivedWhole(chunks, page.ExpectedTableFacts);
            if (survived) tablesSurvived++;

            double score = 0;
            if (transcribed)
            {
                var evidence =
                    "The following is an AI transcription of a document page to Markdown. Score how faithfully " +
                    "it reproduces the page's table.\n\n" +
                    $"Facts the page's table states (a faithful transcription must contain each):\n- {string.Join("\n- ", page.ExpectedTableFacts)}\n\n" +
                    $"Transcription:\n{markdown}";
                score = await JudgeRubricAsync(chatConfig, TranscriptionFeature, TranscriptionRubric, evidence, ct);
                transcriptionScores.Add(score);
            }

            pageCases.Add(new PdfVisionPageCase(page.Page, transcribed, score, survived));
        }

        // 4) Embed chunks + questions (cosine top-k), then answer via the REAL Ask path and judge + cite-check.
        var chunkVectors = chunks.Count == 0
            ? []
            : await embedder.EmbedBatchAsync(chunks.Select(c => c.Text).ToList(), ct);

        var qaCases = new List<PdfVisionQaCase>(golden.Questions.Count);
        var answerScores = new List<double>();
        var citedExpected = 0;
        foreach (var q in golden.Questions)
        {
            ct.ThrowIfCancellationRequested();
            var retrieved = await RetrieveAsync(embedder, chunks, chunkVectors, q.Question, k, ct);
            var answer = await ask.AskFromChunksAsync(q.Question, retrieved, [], [], lastReadOrd: int.MaxValue, ct);

            var citedPages = answer.Citations
                .Select(c => c.Chunk.SourcePage)
                .Where(p => p.HasValue)
                .Select(p => p!.Value)
                .Distinct()
                .ToList();
            var citedExpectedPage = answer.Citations.Any(c => c.Chunk.SourcePage == q.ExpectedPage);
            if (citedExpectedPage) citedExpected++;

            double score = 0;
            if (!answer.Insufficient)
            {
                var evidence =
                    $"Question: {q.Question}\n\n" +
                    $"Facts a correct answer must state (from the source table):\n- {string.Join("\n- ", q.ExpectedAnswerFacts)}\n\n" +
                    $"Answer:\n{answer.Answer}";
                score = await JudgeRubricAsync(chatConfig, AnswerFeature, AnswerRubric, evidence, ct);
                answerScores.Add(score);
            }

            qaCases.Add(new PdfVisionQaCase(
                q.Question, q.ExpectedPage, score, citedExpectedPage, citedPages, answer.Insufficient));
        }

        var transcription = Mean(transcriptionScores);
        var answerMean = Mean(answerScores);
        var citation = golden.Questions.Count == 0 ? 0 : (double)citedExpected / golden.Questions.Count;
        var tableStructure = golden.Pages.Count == 0 ? 0 : (double)tablesSurvived / golden.Pages.Count;

        logger.LogInformation(
            "PDF vision eval pages={Pages} transcription={Trans:0.00} answer={Ans:0.00} citation={Cite:0.00} tableStructure={Table:0.00}",
            pages.Count, transcription, answerMean, citation, tableStructure);

        if (persist && db is not null)
        {
            db.EvalRuns.Add(CitationJudge.MakeRun(TranscriptionFeature, VisionModelId, judgeModelId,
                (decimal)transcription, transcriptionScores.Count, gitSha,
                $"{{\"pages\":{pages.Count},\"perPage\":[{string.Join(",", pageCases.Where(c => c.Transcribed).Select(c => $"{{\"page\":{c.Page},\"score\":{c.JudgeScore:0.000}}}"))}]}}"));
            db.EvalRuns.Add(CitationJudge.MakeRun(AnswerFeature, RagAskService.FeatureTag, judgeModelId,
                (decimal)answerMean, answerScores.Count, gitSha,
                $"{{\"questions\":{golden.Questions.Count},\"answered\":{answerScores.Count}}}"));
            db.EvalRuns.Add(CitationJudge.MakeRun(CitationFeature, RagAskService.FeatureTag, NoJudge,
                (decimal)citation, golden.Questions.Count, gitSha,
                $"{{\"citedExpectedPage\":{citedExpected},\"questions\":{golden.Questions.Count}}}"));
            db.EvalRuns.Add(CitationJudge.MakeRun(TableStructureFeature, ChunkerModelId, NoJudge,
                (decimal)tableStructure, golden.Pages.Count, gitSha,
                $"{{\"tablesSurvived\":{tablesSurvived},\"pages\":{golden.Pages.Count},\"chunks\":{chunks.Count}}}"));
            await db.SaveChangesAsync(ct);
        }

        return new PdfVisionEvalResult(
            transcription, answerMean, citation, tableStructure,
            pages.Count, golden.Questions.Count, pageCases, qaCases, Note: null);
    }

    /// <summary>Transcribe one fixture page through the gateway vision route with the SHARED prod prompt.</summary>
    private static async Task<string> TranscribeAsync(ILlmService vision, string imageResource, CancellationToken ct)
    {
        var jpeg = PdfVisionGoldenSet.LoadImage(imageResource);
        var request = new LlmRequest(
            SystemPrompt: PdfVisionPrompt.SystemPrompt,
            Messages: [new LlmMessage("user", PdfVisionPrompt.UserPrompt, Images: [new LlmImage(jpeg, "image/jpeg")])],
            MaxOutputTokens: PdfVisionPrompt.MaxOutputTokens,
            FeatureTag: VisionFeatureTag);
        var response = await vision.CompleteAsync(request, ct);
        return StripCodeFence(response.Text);
    }

    /// <summary>
    /// Cosine top-k over the pre-embedded chunks, building <see cref="RetrievedChunk"/>s that stamp
    /// <c>SourcePage</c> from <see cref="MarkdownChunk.SourcePage"/> EXACTLY as <c>RagService</c> does —
    /// so the citation metric measures the same page provenance prod ships.
    /// </summary>
    private static async Task<IReadOnlyList<RetrievedChunk>> RetrieveAsync(
        IEmbeddingService embedder, IReadOnlyList<MarkdownChunk> chunks, IReadOnlyList<float[]> chunkVectors,
        string question, int k, CancellationToken ct)
    {
        if (chunks.Count == 0)
            return [];
        var qVector = await embedder.EmbedAsync(question, ct);
        return chunks
            .Select((c, i) => (Chunk: c, Score: Cosine(qVector, chunkVectors[i])))
            .OrderByDescending(x => x.Score)
            .Take(k <= 0 ? IRagService.DefaultK : k)
            .Select(x => new RetrievedChunk(
                Guid.NewGuid(), ChapterId: null, ChapterOrd: 0, x.Chunk.Ord, x.Chunk.Text,
                x.Chunk.CharStart, x.Chunk.CharEnd, x.Score, x.Chunk.SourcePage, x.Chunk.SectionPath))
            .ToList();
    }

    /// <summary>A golden table survives whole iff a SINGLE chunk contains every one of its facts.</summary>
    private static bool TableSurvivedWhole(IReadOnlyList<MarkdownChunk> chunks, IReadOnlyList<string> facts) =>
        facts.Count > 0 && chunks.Any(c =>
            facts.All(f => c.Text.Contains(f, StringComparison.OrdinalIgnoreCase)));

    /// <summary>Score one case with the shared MEAI <see cref="RubricEvaluator"/> — returns the 1–5 mean of the three axes.</summary>
    private static async Task<double> JudgeRubricAsync(
        ChatConfiguration chatConfig, string feature, Rubric rubric, string evidence, CancellationToken ct)
    {
        var evaluator = new RubricEvaluator(feature, rubric);
        var result = await evaluator.EvaluateAsync(
            JudgePlaceholderMessages,
            new ChatResponse(new ChatMessage(ChatRole.Assistant, string.Empty)),
            chatConfig, [new RubricEvidenceContext(evidence)], ct);
        var d1 = ReadAxis(result, feature, rubric.Dim1);
        var d2 = ReadAxis(result, feature, rubric.Dim2);
        var d3 = ReadAxis(result, feature, rubric.Dim3);
        return (d1 + d2 + d3) / 3.0;
    }

    // RubricEvaluator names each axis "{feature}.{label}" (label = text before ':').
    private static int ReadAxis(EvaluationResult result, string feature, string dim) =>
        (int)Math.Round(result.Get<NumericMetric>($"{feature}.{dim.Split(':')[0].Trim()}").Value ?? 0);

    private static double Cosine(float[] a, float[] b)
    {
        double dot = 0, na = 0, nb = 0;
        var n = Math.Min(a.Length, b.Length);
        for (var i = 0; i < n; i++)
        {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        if (na == 0 || nb == 0) return 0;
        return dot / (Math.Sqrt(na) * Math.Sqrt(nb));
    }

    private static double Mean(IReadOnlyList<double> xs) => xs.Count == 0 ? 0 : xs.Average();

    /// <summary>Strip an outer ```/```markdown fence if the model wrapped the page despite the instruction
    /// (parity with the parser's defensive fence strip).</summary>
    private static string StripCodeFence(string text)
    {
        var t = text.Trim();
        if (!t.StartsWith("```", StringComparison.Ordinal))
            return t;
        var firstNewline = t.IndexOf('\n');
        if (firstNewline < 0)
            return t;
        var body = t[(firstNewline + 1)..];
        if (body.EndsWith("```", StringComparison.Ordinal))
            body = body[..^3];
        return body.Trim();
    }
}
