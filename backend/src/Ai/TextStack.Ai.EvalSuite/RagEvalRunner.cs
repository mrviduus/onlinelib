using Application.Common.Interfaces;
using Application.Rag;
using Domain.Entities;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.AI.Evaluation;
using Microsoft.Extensions.Logging;
using TextStack.Ai.Core;
using TextStack.Ai.Evals;
using TextStack.Ai.Llm;
using TextStack.Ai.Rag;

namespace TextStack.Ai.EvalSuite;

/// <summary>One retrieval golden's outcome — surfaced so the admin UI can see which questions miss.</summary>
public sealed record RagRecallCase(string Question, int ExpectedChapterOrd, bool Hit);

/// <summary>One adversarial golden's outcome — how many retrieved chunks leaked past the gate.</summary>
public sealed record RagSpoilerCase(string Question, int GateChapterOrd, int LeakCount);

/// <summary>
/// Citation-correctness summary (AI-027b): the 1–5 judge mean over every cited excerpt plus the
/// support rate (fraction of citations the judge scored ≥4 on the "support" axis — the DoD ≥0.9 metric).
/// </summary>
public sealed record RagCitationSummary(double Score, double SupportRate, int CitationsJudged, int AnswersGenerated);

/// <summary>
/// Result of a RAG eval (AI-027): recall@k + spoiler-leak over the goldens, and — when a judge is
/// supplied (AI-027b) — citation correctness. <see cref="Citation"/> is null for a retrieval-only run.
/// </summary>
public sealed record RagEvalResult(
    double Recall,
    int RecallN,
    double SpoilerLeakRate,
    int SpoilerN,
    IReadOnlyList<RagRecallCase> RecallCases,
    IReadOnlyList<RagSpoilerCase> SpoilerCases,
    RagCitationSummary? Citation);

/// <summary>
/// Runs the Phase 4 RAG eval against a real edition (AI-027). The deterministic half (027a) drives the
/// production <see cref="IRagService"/> (hybrid retrieval, AI-023) over the embedded golden sets and
/// scores it with the pure <see cref="RetrievalMetrics"/> — recall@8, spoiler-leak, no LLM. The judged
/// half (027b) generates a real grounded answer per question via <see cref="IRagAskService"/> and scores
/// each citation against its cited excerpt with the same MEAI <see cref="RubricEvaluator"/> the rest of
/// the eval suite uses. Persists <c>rag.retrieval</c> / <c>rag.spoiler</c> (and <c>rag.citation</c> when
/// judged) <see cref="EvalRun"/> rows. DoD: recall@8 ≥0.85, spoiler-leak = 0, citation support ≥0.9.
/// </summary>
public sealed class RagEvalRunner(ILogger<RagEvalRunner> logger)
{
    // Retrieval scores 0–1 (recall / 1−leak), unlike the 1–5 judged features — the feature key disambiguates.
    private const string RetrievalModelId = "hybrid-retrieval";
    private const string NoJudge = "n/a";
    private const int SupportPassThreshold = 4; // judge ≥4/5 on the support axis = a correct citation
    private const string CitationFeature = "rag.citation";

    // The "support" axis MUST stay Dim1 — SupportRate reads JudgeScore.D1.
    private static readonly Rubric CitationRubric = new(
        "support: does the cited excerpt actually contain or directly imply the specific claim it is attached to?",
        "relevance: is the excerpt genuinely on-topic for the answer, not a loosely-related passage?",
        "faithfulness: does the answer avoid asserting anything the cited excerpts do not support (no outside knowledge)?");

    private static readonly ChatMessage[] JudgePlaceholderMessages = [new ChatMessage(ChatRole.User, string.Empty)];

    public async Task<RagEvalResult> RunAsync(
        IRagService rag,
        IRagAskService? ask,
        ILlmService? judge,
        string? judgeModelId,
        Guid editionId,
        int k,
        bool persist,
        IAppDbContext? db,
        string? gitSha,
        CancellationToken ct)
    {
        var retrievalGoldens = RagGoldenSet.LoadRetrieval();
        var spoilerGoldens = RagGoldenSet.LoadSpoiler();

        // Recall: retrieve UNGATED (we measure raw retrieval quality), score chapter+phrase hits.
        // Keep each question's chunks — the citation phase reuses them as the answer's context.
        var recallCases = new List<(IReadOnlyList<RetrievedChunk>, int, IReadOnlyList<string>)>();
        var recallDetail = new List<RagRecallCase>();
        var retrievedByQuestion = new List<(string Question, IReadOnlyList<RetrievedChunk> Chunks)>();
        foreach (var g in retrievalGoldens)
        {
            ct.ThrowIfCancellationRequested();
            var chunks = await rag.RetrieveAsync(editionId, g.Question, k, maxChapterOrd: null, ct);
            recallCases.Add((chunks, g.ExpectedChapterOrd, g.ExpectedPhrases));
            recallDetail.Add(new RagRecallCase(
                g.Question, g.ExpectedChapterOrd,
                RetrievalMetrics.IsHit(chunks, g.ExpectedChapterOrd, g.ExpectedPhrases)));
            retrievedByQuestion.Add((g.Question, chunks));
        }

        // Spoiler: retrieve GATED at the reader's supposed position; nothing past it may surface.
        var spoilerCases = new List<(IReadOnlyList<RetrievedChunk>, int)>();
        var spoilerDetail = new List<RagSpoilerCase>();
        foreach (var g in spoilerGoldens)
        {
            ct.ThrowIfCancellationRequested();
            var chunks = await rag.RetrieveAsync(editionId, g.Question, k, maxChapterOrd: g.GateChapterOrd, ct);
            spoilerCases.Add((chunks, g.GateChapterOrd));
            spoilerDetail.Add(new RagSpoilerCase(
                g.Question, g.GateChapterOrd, RetrievalMetrics.LeakCount(chunks, g.GateChapterOrd)));
        }

        var recall = RetrievalMetrics.Recall(recallCases);
        var leakRate = RetrievalMetrics.LeakRate(spoilerCases);

        // Citation correctness (027b) — only when a generator + judge are supplied.
        RagCitationSummary? citation = null;
        if (ask is not null && judge is not null)
            citation = await JudgeCitationsAsync(ask, judge, retrievedByQuestion, ct);

        logger.LogInformation(
            "RAG eval edition={Edition} recall@{K}={Recall:0.00} (N={RecallN}) spoilerLeakRate={Leak:0.00} (N={SpoilerN}) citation={Cit}",
            editionId, k, recall, recallCases.Count, leakRate, spoilerCases.Count,
            citation is null ? "(skipped)" : $"{citation.Score:0.00}/support {citation.SupportRate:0.00}");

        if (persist && db is not null)
        {
            db.EvalRuns.Add(MakeRun("rag.retrieval", RetrievalModelId, NoJudge, (decimal)recall, recallCases.Count, gitSha,
                $"{{\"recallAtK\":{recall:0.000},\"k\":{k},\"hits\":{recallDetail.Count(c => c.Hit)}}}"));
            db.EvalRuns.Add(MakeRun("rag.spoiler", RetrievalModelId, NoJudge, (decimal)(1.0 - leakRate), spoilerCases.Count, gitSha,
                $"{{\"leakRate\":{leakRate:0.000},\"leakingCases\":{spoilerDetail.Count(c => c.LeakCount > 0)}}}"));
            if (citation is not null)
                db.EvalRuns.Add(MakeRun(CitationFeature, RagAskService.FeatureTag, judgeModelId ?? NoJudge,
                    (decimal)citation.Score, citation.CitationsJudged, gitSha,
                    $"{{\"supportRate\":{citation.SupportRate:0.000},\"answers\":{citation.AnswersGenerated}}}"));
            await db.SaveChangesAsync(ct);
        }

        return new RagEvalResult(recall, recallCases.Count, leakRate, spoilerCases.Count, recallDetail, spoilerDetail, citation);
    }

    /// <summary>
    /// Generates a grounded answer per question (over its already-retrieved chunks) and judges each
    /// citation against the FULL text of the excerpt it points to. Returns the mean 1–5 score and the
    /// support rate (citations scored ≥<see cref="SupportPassThreshold"/> on the support axis).
    /// </summary>
    private async Task<RagCitationSummary> JudgeCitationsAsync(
        IRagAskService ask,
        ILlmService judge,
        IReadOnlyList<(string Question, IReadOnlyList<RetrievedChunk> Chunks)> retrieved,
        CancellationToken ct)
    {
        var chatConfig = new ChatConfiguration(new LlmServiceChatClient(judge, defaultFeatureTag: "eval.judge"));
        var scores = new List<JudgeScore>();
        var supported = 0;
        var answersGenerated = 0;

        foreach (var (question, chunks) in retrieved)
        {
            ct.ThrowIfCancellationRequested();
            // lastReadOrd is irrelevant here — chunks are supplied directly (no user gating).
            var answer = await ask.AskFromChunksAsync(question, chunks, [], [], lastReadOrd: int.MaxValue, ct);
            if (answer.Insufficient || answer.Citations.Count == 0)
                continue;
            answersGenerated++;

            foreach (var cited in answer.Citations)
            {
                ct.ThrowIfCancellationRequested();
                var evidence =
                    $"Question: {question}\n\nAnswer:\n{answer.Answer}\n\n" +
                    $"Cited excerpt [{cited.Marker}] (the answer attributes a claim to this passage):\n{cited.Chunk.Text}";

                var evaluator = new RubricEvaluator(CitationFeature, CitationRubric);
                var result = await evaluator.EvaluateAsync(
                    JudgePlaceholderMessages,
                    new ChatResponse(new ChatMessage(ChatRole.Assistant, answer.Answer)),
                    chatConfig, [new RubricEvidenceContext(evidence)], ct);

                var score = new JudgeScore(
                    ReadAxis(result, CitationRubric.Dim1),
                    ReadAxis(result, CitationRubric.Dim2),
                    ReadAxis(result, CitationRubric.Dim3),
                    string.Empty);
                scores.Add(score);
                if (score.D1 >= SupportPassThreshold)
                    supported++;
            }
        }

        if (scores.Count == 0)
            return new RagCitationSummary(0, 0, 0, answersGenerated);

        var summary = JudgeRunner.Aggregate(scores);
        var supportRate = (double)supported / scores.Count;
        return new RagCitationSummary(summary.MeanOverall, supportRate, scores.Count, answersGenerated);
    }

    // RubricEvaluator names each axis "{feature}.{label}" (label = text before ':').
    private static int ReadAxis(EvaluationResult result, string dim) =>
        (int)Math.Round(result.Get<NumericMetric>($"{CitationFeature}.{dim.Split(':')[0].Trim()}").Value ?? 0);

    private static EvalRun MakeRun(
        string feature, string modelId, string judgeModelId, decimal score, int n, string? gitSha, string breakdown) => new()
        {
            Id = Guid.NewGuid(),
            Feature = feature,
            ModelId = modelId,
            JudgeModelId = judgeModelId,
            Score = Math.Round(score, 3),
            N = n,
            BreakdownJson = breakdown,
            GitSha = gitSha,
            CreatedAt = DateTimeOffset.UtcNow,
        };
}
