using Application.Common.Interfaces;
using Application.Rag;
using Microsoft.Extensions.Logging;
using TextStack.Ai.Core;
using TextStack.Ai.Evals;
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
    private const string NoJudge = CitationJudge.NoJudge;

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
            var chunks = await rag.RetrieveAsync(editionId, g.Question, k, maxChapterOrd: null, SummarySpec.None, ct);
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
            var chunks = await rag.RetrieveAsync(editionId, g.Question, k, maxChapterOrd: g.GateChapterOrd, SummarySpec.None, ct);
            spoilerCases.Add((chunks, g.GateChapterOrd));
            spoilerDetail.Add(new RagSpoilerCase(
                g.Question, g.GateChapterOrd, RetrievalMetrics.LeakCount(chunks, g.GateChapterOrd)));
        }

        var recall = RetrievalMetrics.Recall(recallCases);
        var leakRate = RetrievalMetrics.LeakRate(spoilerCases);

        // Citation correctness (027b) — only when a generator + judge are supplied.
        RagCitationSummary? citation = null;
        if (ask is not null && judge is not null)
            citation = await CitationJudge.JudgeCitationsAsync(ask, judge, retrievedByQuestion, ct);

        logger.LogInformation(
            "RAG eval edition={Edition} recall@{K}={Recall:0.00} (N={RecallN}) spoilerLeakRate={Leak:0.00} (N={SpoilerN}) citation={Cit}",
            editionId, k, recall, recallCases.Count, leakRate, spoilerCases.Count,
            citation is null ? "(skipped)" : $"{citation.Score:0.00}/support {citation.SupportRate:0.00}");

        if (persist && db is not null)
        {
            db.EvalRuns.Add(CitationJudge.MakeRun("rag.retrieval", RetrievalModelId, NoJudge, (decimal)recall, recallCases.Count, gitSha,
                $"{{\"recallAtK\":{recall:0.000},\"k\":{k},\"hits\":{recallDetail.Count(c => c.Hit)}}}"));
            db.EvalRuns.Add(CitationJudge.MakeRun("rag.spoiler", RetrievalModelId, NoJudge, (decimal)(1.0 - leakRate), spoilerCases.Count, gitSha,
                $"{{\"leakRate\":{leakRate:0.000},\"leakingCases\":{spoilerDetail.Count(c => c.LeakCount > 0)}}}"));
            if (citation is not null)
                db.EvalRuns.Add(CitationJudge.MakeRun(CitationJudge.CitationFeature, RagAskService.FeatureTag, judgeModelId ?? NoJudge,
                    (decimal)citation.Score, citation.CitationsJudged, gitSha,
                    $"{{\"supportRate\":{citation.SupportRate:0.000},\"answers\":{citation.AnswersGenerated}}}"));
            await db.SaveChangesAsync(ct);
        }

        return new RagEvalResult(recall, recallCases.Count, leakRate, spoilerCases.Count, recallDetail, spoilerDetail, citation);
    }
}
