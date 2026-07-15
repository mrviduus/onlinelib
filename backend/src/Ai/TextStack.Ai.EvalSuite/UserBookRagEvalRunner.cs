using Application.Common.Interfaces;
using Application.Rag;
using Microsoft.Extensions.Logging;
using TextStack.Ai.Core;
using TextStack.Ai.Evals;
using TextStack.Ai.Llm;
using TextStack.Ai.Rag;

namespace TextStack.Ai.EvalSuite;

/// <summary>One generated grounding probe's outcome — the question we synthesised and whether Ask cited it.</summary>
public sealed record UserBookProbeCase(string Question, int Citations, bool Insufficient);

/// <summary>
/// The two behavioural probes (greeting + off-book) surfaced for the admin UI — each pass/fail with a
/// short note so the owner can see WHY a companion run failed without re-reading private content.
/// </summary>
public sealed record UserBookBehaviorCase(string Kind, string Question, bool Pass, string Note);

/// <summary>
/// Result of a user-book RAG eval (P1): the citation summary over the generated grounding probes, the
/// fraction of those probes that retrieved ≥1 chunk (<see cref="Retrieval"/>), the combined behaviour
/// pass-fraction (greeting + off-book), and per-probe detail. <see cref="Citation"/> is null when the
/// book has no indexed chunks (empty-chunks short-circuit — no LLM call was made).
/// </summary>
public sealed record UserBookRagEvalResult(
    RagCitationSummary? Citation,
    double Retrieval,
    int ProbeN,
    double BehaviorPass,
    IReadOnlyList<UserBookProbeCase> ProbeCases,
    IReadOnlyList<UserBookBehaviorCase> BehaviorCases,
    string? Note);

/// <summary>
/// Live grounding validation for ANY user-uploaded book (P1, sibling to <see cref="RagEvalRunner"/>).
/// The catalog eval scores fixed golden sets keyed by editionId; user books have no goldens, so this
/// runner SYNTHESISES probes from the book's own chunks instead:
/// <list type="bullet">
///   <item><b>Generated grounding (N probes):</b> seed retrieval for a spread of chunks, ask the
///   generator to write one self-contained question per chunk, then run the REAL Ask path per question
///   (full-book retrieval, no gate) and judge the answer's citations with the shared
///   <see cref="CitationJudge"/> — same rubric + SupportRate as the catalog.</item>
///   <item><b>Greeting ("hi"):</b> a warm greeting must answer, not cite, and not refuse — a purely
///   structural check (no judge call).</item>
///   <item><b>Off-book:</b> a clearly off-book question must either decline or stay grounded — judged
///   for invented facts.</item>
/// </list>
/// Empty/un-embedded book → short-circuit: NO generator/judge LLM call, persist a failed 0-row with a
/// note (mirrors the catalog "no-LLM-on-empty" invariant). Persists <c>rag.userbook.citation</c>,
/// <c>rag.userbook.behavior</c> (and <c>rag.userbook.retrieval</c>) <see cref="EvalRun"/> rows.
/// </summary>
public sealed class UserBookRagEvalRunner(ILogger<UserBookRagEvalRunner> logger)
{
    public const string CitationFeature = "rag.userbook.citation";
    public const string BehaviorFeature = "rag.userbook.behavior";
    public const string RetrievalFeature = "rag.userbook.retrieval";
    private const string GeneratorModelId = "userbook-probe-gen";

    // A broad seed that surfaces a spread of the book's chunks regardless of subject matter.
    private const string SeedQuery = "main ideas and key topics summary";

    // A fixed off-book question — its answer must decline or stay grounded, never invent.
    private const string OffBookQuestion =
        "What does this book say about the 2026 FIFA World Cup final score?";

    private const string ProbeGenSystemPrompt =
        "You write a single reading-comprehension question grounded in one passage.";

    public async Task<UserBookRagEvalResult> RunAsync(
        IRagService rag,
        IRagAskService ask,
        ILlmService generator,
        ILlmService judge,
        string judgeModelId,
        Guid userId,
        Guid userBookId,
        int probeCount,
        int k,
        bool persist,
        IAppDbContext? db,
        string? gitSha,
        CancellationToken ct)
    {
        // Seed retrieval for a spread of chunks. Empty => un-embedded/empty book: short-circuit with NO
        // generator/judge LLM call (mirrors the catalog no-LLM-on-empty invariant).
        var seed = await rag.RetrieveUserBookAsync(userId, userBookId, SeedQuery, probeCount, maxChapterOrd: null, SummarySpec.None, ct);
        if (seed.Count == 0)
        {
            const string note = "No indexed chunks for this user book — not embedded yet (no LLM call made).";
            logger.LogInformation(
                "user-book RAG eval userBook={UserBook} skipped — no indexed chunks", userBookId);
            if (persist && db is not null)
            {
                db.EvalRuns.Add(CitationJudge.MakeRun(CitationFeature, GeneratorModelId, judgeModelId, 0m, 0, gitSha,
                    $"{{\"note\":\"empty-chunks\",\"probes\":0}}"));
                db.EvalRuns.Add(CitationJudge.MakeRun(BehaviorFeature, GeneratorModelId, judgeModelId, 0m, 0, gitSha,
                    $"{{\"note\":\"empty-chunks\"}}"));
                await db.SaveChangesAsync(ct);
            }
            return new UserBookRagEvalResult(
                Citation: null, Retrieval: 0, ProbeN: 0, BehaviorPass: 0, ProbeCases: [], BehaviorCases: [], Note: note);
        }

        // 1) Generate one self-contained question per seed chunk (one generator call each).
        var questions = new List<string>(seed.Count);
        foreach (var chunk in seed)
        {
            ct.ThrowIfCancellationRequested();
            questions.Add(await GenerateProbeAsync(generator, chunk.Text, ct));
        }

        // 2) Run the REAL Ask path per question (full-book retrieval, no gate) and keep the retrieved
        //    chunks so the shared CitationJudge can score the resulting answer's citations.
        var retrievedByQuestion = new List<(string Question, IReadOnlyList<RetrievedChunk> Chunks)>();
        var probeCases = new List<UserBookProbeCase>();
        var probesWithChunks = 0;
        foreach (var question in questions)
        {
            ct.ThrowIfCancellationRequested();
            var chunks = await rag.RetrieveUserBookAsync(userId, userBookId, question, k, maxChapterOrd: null, SummarySpec.None, ct);
            if (chunks.Count > 0)
                probesWithChunks++;
            retrievedByQuestion.Add((question, chunks));
        }

        var citation = await CitationJudge.JudgeCitationsAsync(ask, judge, retrievedByQuestion, ct);

        // Per-probe detail: re-run Ask once for the breakdown (cheap, mirrors the judge's own Ask call —
        // we surface citation count + insufficiency per probe for the admin view).
        foreach (var (question, chunks) in retrievedByQuestion)
        {
            ct.ThrowIfCancellationRequested();
            var answer = await ask.AskFromChunksAsync(question, chunks, [], [], lastReadOrd: int.MaxValue, ct);
            probeCases.Add(new UserBookProbeCase(question, answer.Citations.Count, answer.Insufficient));
        }

        var retrievalRate = (double)probesWithChunks / questions.Count;

        // 3) Behaviour probes: greeting (structural) + off-book (judged for invented facts).
        var greeting = await EvaluateGreetingAsync(rag, ask, userId, userBookId, k, ct);
        var offBook = await EvaluateOffBookAsync(rag, ask, judge, userId, userBookId, k, ct);
        var behaviorCases = new[] { greeting, offBook };
        var behaviorPass = behaviorCases.Count(c => c.Pass) / (double)behaviorCases.Length;

        logger.LogInformation(
            "user-book RAG eval userBook={UserBook} probes={Probes} citation={Cit}/support {Support:0.00} retrieval={Retrieval:0.00} behavior={Behavior:0.00}",
            userBookId, questions.Count, citation.Score, citation.SupportRate, retrievalRate, behaviorPass);

        if (persist && db is not null)
        {
            db.EvalRuns.Add(CitationJudge.MakeRun(CitationFeature, GeneratorModelId, judgeModelId,
                (decimal)citation.Score, citation.CitationsJudged, gitSha,
                $"{{\"supportRate\":{citation.SupportRate:0.000},\"answers\":{citation.AnswersGenerated},\"probes\":{questions.Count}}}"));
            db.EvalRuns.Add(CitationJudge.MakeRun(BehaviorFeature, GeneratorModelId, judgeModelId,
                (decimal)behaviorPass, behaviorCases.Length, gitSha,
                $"{{\"greeting\":{greeting.Pass.ToString().ToLowerInvariant()},\"offBook\":{offBook.Pass.ToString().ToLowerInvariant()}}}"));
            db.EvalRuns.Add(CitationJudge.MakeRun(RetrievalFeature, GeneratorModelId, CitationJudge.NoJudge,
                (decimal)retrievalRate, questions.Count, gitSha,
                $"{{\"probesWithChunks\":{probesWithChunks}}}"));
            await db.SaveChangesAsync(ct);
        }

        return new UserBookRagEvalResult(
            citation, retrievalRate, questions.Count, behaviorPass, probeCases, behaviorCases, Note: null);
    }

    /// <summary>One generator call: a self-contained, non-yes/no question answerable only from the passage.</summary>
    private static async Task<string> GenerateProbeAsync(ILlmService generator, string passage, CancellationToken ct)
    {
        var prompt =
            "Write one self-contained question answerable ONLY from this passage. No yes/no. " +
            "Output the question only.\n\nPassage:\n" + passage;
        var request = new LlmRequest(
            SystemPrompt: ProbeGenSystemPrompt,
            Messages: [new LlmMessage("user", prompt)],
            MaxOutputTokens: 80,
            FeatureTag: "eval.userbook.gen");
        var response = await generator.CompleteAsync(request, ct);
        return response.Text.Trim();
    }

    /// <summary>
    /// Greeting probe: a warm "hi" must answer (non-empty), NOT cite (no citations, no <c>[n]</c> marker
    /// in the text), and NOT refuse (not insufficient). Purely structural — no judge call.
    /// </summary>
    private static async Task<UserBookBehaviorCase> EvaluateGreetingAsync(
        IRagService rag, IRagAskService ask, Guid userId, Guid userBookId, int k, CancellationToken ct)
    {
        const string question = "hi";
        var chunks = await rag.RetrieveUserBookAsync(userId, userBookId, question, k, maxChapterOrd: null, SummarySpec.None, ct);
        var answer = await ask.AskFromChunksAsync(question, chunks, [], [], lastReadOrd: int.MaxValue, ct);

        var nonEmpty = !string.IsNullOrWhiteSpace(answer.Answer);
        var noCitations = answer.Citations.Count == 0;
        var notRefused = !answer.Insufficient;
        var noMarker = !HasCitationMarker(answer.Answer);
        var pass = nonEmpty && noCitations && notRefused && noMarker;

        var note = pass
            ? "Warm greeting: answered, no citations, not refused."
            : $"Failed structural greeting check (nonEmpty={nonEmpty}, noCitations={noCitations}, notRefused={notRefused}, noMarker={noMarker}).";
        return new UserBookBehaviorCase("greeting", question, pass, note);
    }

    /// <summary>
    /// Off-book probe: a clearly off-book question must gracefully decline OR stay grounded with no
    /// invented facts. Passes iff the answer is insufficient OR the judge finds no invented facts.
    /// </summary>
    private static async Task<UserBookBehaviorCase> EvaluateOffBookAsync(
        IRagService rag, IRagAskService ask, ILlmService judge, Guid userId, Guid userBookId, int k, CancellationToken ct)
    {
        var chunks = await rag.RetrieveUserBookAsync(userId, userBookId, OffBookQuestion, k, maxChapterOrd: null, SummarySpec.None, ct);
        var answer = await ask.AskFromChunksAsync(OffBookQuestion, chunks, [], [], lastReadOrd: int.MaxValue, ct);

        if (answer.Insufficient)
            return new UserBookBehaviorCase("off_book", OffBookQuestion, true,
                "Declined an off-book question (insufficient context).");

        var noInvented = await CitationJudge.JudgeNoInventedFactsAsync(judge, OffBookQuestion, answer.Answer, ct);
        var note = noInvented
            ? "Stayed grounded on an off-book question (no invented facts)."
            : "Introduced facts not grounded in the book on an off-book question.";
        return new UserBookBehaviorCase("off_book", OffBookQuestion, noInvented, note);
    }

    private static bool HasCitationMarker(string text)
    {
        for (var i = 0; i + 2 < text.Length; i++)
            if (text[i] == '[' && char.IsDigit(text[i + 1]))
            {
                var j = i + 1;
                while (j < text.Length && char.IsDigit(text[j])) j++;
                if (j < text.Length && text[j] == ']')
                    return true;
            }
        return false;
    }
}
