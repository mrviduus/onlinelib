using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.Extensions.Logging;
using TextStack.Ai.Rag;

namespace TextStack.Ai.EvalSuite;

/// <summary>One retrieval golden's outcome — surfaced so the admin UI can see which questions miss.</summary>
public sealed record RagRecallCase(string Question, int ExpectedChapterOrd, bool Hit);

/// <summary>One adversarial golden's outcome — how many retrieved chunks leaked past the gate.</summary>
public sealed record RagSpoilerCase(string Question, int GateChapterOrd, int LeakCount);

/// <summary>
/// Result of a RAG retrieval eval (AI-027a): recall@k over the retrieval goldens and the spoiler-leak
/// rate over the adversarial set, plus per-case detail. Citation-correctness (LLM judge) is AI-027b.
/// </summary>
public sealed record RagEvalResult(
    double Recall,
    int RecallN,
    double SpoilerLeakRate,
    int SpoilerN,
    IReadOnlyList<RagRecallCase> RecallCases,
    IReadOnlyList<RagSpoilerCase> SpoilerCases);

/// <summary>
/// Runs the deterministic half of the Phase 4 RAG eval against a real edition (AI-027a): it drives the
/// production <see cref="IRagService"/> (hybrid retrieval, AI-023) over the embedded golden sets and
/// scores the results with the pure <see cref="RetrievalMetrics"/> — no LLM. DoD targets: recall@8
/// ≥0.85, spoiler-leak = 0. Persists two <see cref="EvalRun"/> rows (<c>rag.retrieval</c>,
/// <c>rag.spoiler</c>) so the /ai-quality Evals tab tracks them like every other feature.
/// </summary>
public sealed class RagEvalRunner(ILogger<RagEvalRunner> logger)
{
    // Retrieval scores 0–1 (recall / 1−leak), unlike the 1–5 judged features — the feature key disambiguates.
    private const string RetrievalModelId = "hybrid-retrieval";
    private const string NoJudge = "n/a";

    public async Task<RagEvalResult> RunAsync(
        IRagService rag,
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
        var recallCases = new List<(IReadOnlyList<RetrievedChunk>, int, IReadOnlyList<string>)>();
        var recallDetail = new List<RagRecallCase>();
        foreach (var g in retrievalGoldens)
        {
            ct.ThrowIfCancellationRequested();
            var chunks = await rag.RetrieveAsync(editionId, g.Question, k, maxChapterOrd: null, ct);
            recallCases.Add((chunks, g.ExpectedChapterOrd, g.ExpectedPhrases));
            recallDetail.Add(new RagRecallCase(
                g.Question, g.ExpectedChapterOrd,
                RetrievalMetrics.IsHit(chunks, g.ExpectedChapterOrd, g.ExpectedPhrases)));
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
        logger.LogInformation(
            "RAG eval edition={Edition} recall@{K}={Recall:0.00} (N={RecallN}) spoilerLeakRate={Leak:0.00} (N={SpoilerN})",
            editionId, k, recall, recallCases.Count, leakRate, spoilerCases.Count);

        if (persist && db is not null)
        {
            db.EvalRuns.Add(MakeRun("rag.retrieval", (decimal)recall, recallCases.Count, gitSha,
                $"{{\"recallAtK\":{recall:0.000},\"k\":{k},\"hits\":{recallDetail.Count(c => c.Hit)}}}"));
            db.EvalRuns.Add(MakeRun("rag.spoiler", (decimal)(1.0 - leakRate), spoilerCases.Count, gitSha,
                $"{{\"leakRate\":{leakRate:0.000},\"leakingCases\":{spoilerDetail.Count(c => c.LeakCount > 0)}}}"));
            await db.SaveChangesAsync(ct);
        }

        return new RagEvalResult(recall, recallCases.Count, leakRate, spoilerCases.Count, recallDetail, spoilerDetail);
    }

    private static EvalRun MakeRun(string feature, decimal score, int n, string? gitSha, string breakdown) => new()
    {
        Id = Guid.NewGuid(),
        Feature = feature,
        ModelId = RetrievalModelId,
        JudgeModelId = NoJudge,
        Score = Math.Round(score, 3),
        N = n,
        BreakdownJson = breakdown,
        GitSha = gitSha,
        CreatedAt = DateTimeOffset.UtcNow,
    };
}
