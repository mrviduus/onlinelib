using Application.Agents;
using Microsoft.Extensions.Logging;
using TextStack.Ai.Core;

namespace TextStack.Ai.EvalSuite;

/// <summary>One librarian golden's outcome — surfaced per case for the admin UI / test assertions.</summary>
public sealed record LibrarianCase(
    string Query,
    int Returned,
    int LibraryReturned,
    double RecallAtK,
    double PrecisionAtK,
    double F1AtK,
    bool ConstraintsSatisfied,
    bool CoverageDecisionCorrect,
    bool NoHallucination,
    int ToolCalls);

/// <summary>
/// Result of a Librarian-agent eval run (AI-Agent-3). The headline numbers per the design doc:
/// <see cref="RecallAtK"/> (did the expected catalog books surface), <see cref="PrecisionAtK"/> (of the library
/// books it returned, how many were actually relevant — the counterweight to recall so an agent can't score green
/// by flooding the cap with real-but-irrelevant books), <see cref="F1AtK"/> (their harmonic mean — the headline
/// relevance gate), <see cref="ConstraintSatisfaction"/> (do returned library books actually respect
/// language/length constraints?), <see cref="CoverageDecisionAccuracy"/> (did the agent correctly decide to
/// expand externally when the library was thin?), and the safety invariant <see cref="HallucinationFreeRate"/> —
/// every returned library book MUST carry a real edition id/slug that the tools actually retrieved (should always
/// be 1.0; the parser enforces it, this measures it end-to-end).
/// </summary>
public sealed record LibrarianEvalResult(
    double RecallAtK,
    double PrecisionAtK,
    double F1AtK,
    double ConstraintSatisfaction,
    double CoverageDecisionAccuracy,
    double HallucinationFreeRate,
    double AvgToolCalls,
    int N,
    IReadOnlyList<LibrarianCase> Cases);

/// <summary>
/// Runs the Librarian eval: for each golden, runs the REAL <see cref="LibrarianAgent"/> (its tools hit the live
/// catalog search + DB, and Open Library) and scores recall@k / constraint-satisfaction / coverage-decision /
/// hallucination DETERMINISTICALLY (no LLM judge — relevance labels are in the golden). Mirrors
/// <see cref="EnrichmentEvalRunner"/>'s shape: take the agent + scoped services, run per case, aggregate. The
/// hallucination check requires a <paramref name="slugExists"/> probe so the runner can confirm a returned
/// library slug is genuinely a catalog entry, not merely well-formed.
/// </summary>
public sealed class LibrarianEvalRunner(ILogger<LibrarianEvalRunner> logger)
{
    public async Task<LibrarianEvalResult> RunAsync(
        LibrarianAgent agent,
        IServiceProvider services,
        Func<string, CancellationToken, Task<bool>> slugExists,
        CancellationToken ct)
    {
        var goldens = GoldenLoader.Load<LibrarianGolden>("librarian.json");
        return await RunAsync(agent, services, slugExists, goldens, ct);
    }

    /// <summary>Overload taking an explicit golden set (used by tests to keep the run small + deterministic).</summary>
    public async Task<LibrarianEvalResult> RunAsync(
        LibrarianAgent agent,
        IServiceProvider services,
        Func<string, CancellationToken, Task<bool>> slugExists,
        IReadOnlyList<LibrarianGolden> goldens,
        CancellationToken ct)
    {
        var cases = new List<LibrarianCase>();
        double recallSum = 0, precisionSum = 0, f1Sum = 0;
        int recallScored = 0;
        int constraintCorrect = 0, constraintScored = 0;
        int coverageCorrect = 0;
        int hallucinationFree = 0;
        var totalToolCalls = 0;

        foreach (var g in goldens)
        {
            ct.ThrowIfCancellationRequested();

            var ctx = new AgentContext(null, null, Guid.NewGuid(), services);
            LibrarianAnswer answer;
            int toolCalls;
            try
            {
                var outcome = await agent.RunAsync(new LibrarianInput(g.Query), ctx, ct);
                answer = outcome.Answer;
                toolCalls = outcome.ToolCallsCount;
            }
            catch (AgentBudgetExhaustedException)
            {
                answer = LibrarianAnswer.Empty("budget exhausted");
                toolCalls = 0;
            }

            var library = answer.Recommendations
                .Where(r => r.Source == LibrarianRecommendation.SourceLibrary)
                .ToList();

            // ---- Recall / precision / F1 @k over goldens that HAVE a relevance set ----------------------
            // recall = relevant-returned / expected; precision = relevant-returned / total-library-returned.
            // Precision is the counterweight: an agent that floods the cap with real-but-irrelevant books
            // (recall 1.0) is penalised because most of what it returned isn't in the golden set. F1 is the
            // harmonic mean — the headline relevance gate the DoD reads, immune to the flood exploit.
            double recall = 1.0, precision = 1.0, f1 = 1.0;
            if (g.ExpectedSlugs.Count > 0)
            {
                var expected = g.ExpectedSlugs.ToHashSet(StringComparer.OrdinalIgnoreCase);
                var returnedSlugs = library
                    .Select(r => r.Slug)
                    .Where(s => !string.IsNullOrEmpty(s))
                    .ToList();
                var distinctReturned = returnedSlugs.ToHashSet(StringComparer.OrdinalIgnoreCase);
                var hit = expected.Count(distinctReturned.Contains);

                recall = (double)hit / g.ExpectedSlugs.Count;
                // Denominator is the count of library books returned (over-returning shrinks precision). An
                // empty return on a golden that expected hits is precision 0 (it found none of the relevant).
                precision = distinctReturned.Count > 0 ? (double)hit / distinctReturned.Count : 0.0;
                f1 = recall + precision > 0 ? 2 * recall * precision / (recall + precision) : 0.0;

                recallSum += recall;
                precisionSum += precision;
                f1Sum += f1;
                recallScored++;
            }

            // ---- Constraint satisfaction: every returned library book respects language + max-pages ----
            bool constraintsSatisfied = true;
            if (g.Language is not null || g.MaxPages is not null)
            {
                constraintScored++;
                constraintsSatisfied = library.All(r => SatisfiesConstraints(r, g));
                if (constraintsSatisfied) constraintCorrect++;
            }

            // ---- Coverage decision: did it expand externally exactly when it should have? ----
            var coverageCorrectCase = answer.UsedExternal == g.NeedsExternal;
            if (coverageCorrectCase) coverageCorrect++;

            // ---- Hallucination invariant: every library rec has a real, retrievable slug ----
            var noHallucination = await AllSlugsExistAsync(library, slugExists, ct);
            if (noHallucination) hallucinationFree++;

            totalToolCalls += toolCalls;
            cases.Add(new LibrarianCase(
                g.Query, answer.Recommendations.Count, library.Count, recall, precision, f1,
                constraintsSatisfied, coverageCorrectCase, noHallucination, toolCalls));
        }

        var n = cases.Count;
        var res = new LibrarianEvalResult(
            RecallAtK: recallScored > 0 ? recallSum / recallScored : 1.0,
            PrecisionAtK: recallScored > 0 ? precisionSum / recallScored : 1.0,
            F1AtK: recallScored > 0 ? f1Sum / recallScored : 1.0,
            ConstraintSatisfaction: constraintScored > 0 ? (double)constraintCorrect / constraintScored : 1.0,
            CoverageDecisionAccuracy: n > 0 ? (double)coverageCorrect / n : 1.0,
            HallucinationFreeRate: n > 0 ? (double)hallucinationFree / n : 1.0,
            AvgToolCalls: n > 0 ? (double)totalToolCalls / n : 0,
            N: n,
            Cases: cases);

        logger.LogInformation(
            "Librarian eval recall@k={Recall:0.00} precision@k={Prec:0.00} f1@k={F1:0.00} constraintSat={Cons:0.00} coverageAcc={Cov:0.00} hallucFree={HF:0.00} avgTools={Tools:0.0} (N={N})",
            res.RecallAtK, res.PrecisionAtK, res.F1AtK, res.ConstraintSatisfaction, res.CoverageDecisionAccuracy, res.HallucinationFreeRate, res.AvgToolCalls, n);

        return res;
    }

    private static bool SatisfiesConstraints(LibrarianRecommendation r, LibrarianGolden g)
    {
        if (g.Language is not null
            && !string.Equals(r.Language, g.Language, StringComparison.OrdinalIgnoreCase))
            return false;
        // Length: only enforce when the book actually carries a page estimate (a null is "unknown", not a violation).
        if (g.MaxPages is { } max && r.Pages is { } pages && pages > max)
            return false;
        return true;
    }

    private static async Task<bool> AllSlugsExistAsync(
        IReadOnlyList<LibrarianRecommendation> library,
        Func<string, CancellationToken, Task<bool>> slugExists,
        CancellationToken ct)
    {
        foreach (var r in library)
        {
            if (string.IsNullOrEmpty(r.Slug) || r.EditionId is null)
                return false; // a library rec with no id/slug is a hallucinated catalog entry
            if (!await slugExists(r.Slug, ct))
                return false;
        }
        return true;
    }
}
