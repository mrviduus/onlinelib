using Application.Agents;
using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.AI.Evaluation;
using Microsoft.Extensions.Logging;
using TextStack.Ai.Core;
using TextStack.Ai.Evals;
using TextStack.Ai.Llm;

namespace TextStack.Ai.EvalSuite;

/// <summary>One golden's outcome — for the admin UI.</summary>
public sealed record StudyBuddyCase(string Passage, int Steps, decimal CostUsd, double JudgeScore, bool Completed);

/// <summary>
/// Result of a Study Buddy eval run (AI-039) — the Phase 6 DoD numbers: the judge mean (≥4/5 target),
/// average iterations per run (≤4 target: a planner that's neither lazy nor over-eager) and average
/// cost (&lt;$0.05 target).
/// </summary>
public sealed record StudyBuddyEvalResult(
    double JudgeScore, double AvgSteps, decimal AvgCostUsd, int N, IReadOnlyList<StudyBuddyCase> Cases);

/// <summary>
/// Runs the Phase 6 Study Buddy eval (AI-039): for each golden passage, run the REAL agent against a
/// real edition (its tools hit the live corpus), score the final answer against the reference with the
/// same MEAI <see cref="RubricEvaluator"/> the rest of the suite uses, and record steps + cost. A
/// budget-exhausted run is a failed case (judge 0, steps = the cap). Persists a <c>studybuddy</c>
/// <see cref="EvalRun"/> (judge mean 1–5; avg steps + cost in the breakdown).
/// </summary>
public sealed class StudyBuddyEvalRunner(ILogger<StudyBuddyEvalRunner> logger)
{
    private const string Feature = "studybuddy";

    private static readonly Rubric Rubric = new(
        "correctness: does the explanation accurately convey the meaning the reference explanation captures?",
        "grounding: is it specific to THIS passage and free of invented facts (consistent with the book's domain)?",
        "clarity: is it a clear, concise 3-5 sentence explanation a developer would find genuinely helpful?");

    private static readonly ChatMessage[] JudgePlaceholderMessages = [new ChatMessage(ChatRole.User, string.Empty)];

    public async Task<StudyBuddyEvalResult> RunAsync(
        StudyBuddyAgent agent,
        ILlmService judge,
        string judgeModelId,
        Guid editionId,
        Guid? userId,
        IServiceProvider services,
        bool persist,
        IAppDbContext? db,
        string? gitSha,
        CancellationToken ct)
    {
        var goldens = StudyBuddyGoldenSet.Load();
        var chatConfig = new ChatConfiguration(new LlmServiceChatClient(judge, defaultFeatureTag: "eval.judge"));

        var cases = new List<StudyBuddyCase>();
        var scores = new List<JudgeScore>();
        var totalSteps = 0;
        var totalCost = 0m;

        foreach (var g in goldens)
        {
            ct.ThrowIfCancellationRequested();

            // A fresh run id per golden; the agent's tools resolve scoped services from `services`.
            var agentCtx = new AgentContext(userId, editionId, Guid.NewGuid(), services);
            string answer;
            int steps;
            decimal cost;
            try
            {
                var result = await agent.RunAsync(new StudyBuddyInput(g.Passage, editionId, g.ChapterNumber), agentCtx, ct);
                answer = result.Output;
                steps = result.Usage.Iterations;
                cost = result.Usage.CostUsdTotal;
            }
            catch (AgentBudgetExhaustedException ex)
            {
                // Hitting the cap is a real failure mode: score it 0 and count its (capped) steps/cost.
                cases.Add(new StudyBuddyCase(g.Passage, ex.Usage.Iterations, ex.Usage.CostUsdTotal, 0, Completed: false));
                scores.Add(new JudgeScore(0, 0, 0, "budget exhausted"));
                totalSteps += ex.Usage.Iterations;
                totalCost += ex.Usage.CostUsdTotal;
                continue;
            }

            var evidence =
                $"Passage:\n{g.Passage}\n\nReference explanation:\n{g.RubricAnswer}\n\nAgent's explanation:\n{answer}";
            var evaluator = new RubricEvaluator(Feature, Rubric);
            var result2 = await evaluator.EvaluateAsync(
                JudgePlaceholderMessages, new ChatResponse(new ChatMessage(ChatRole.Assistant, answer)),
                chatConfig, [new RubricEvidenceContext(evidence)], ct);

            var score = new JudgeScore(
                ReadAxis(result2, Rubric.Dim1), ReadAxis(result2, Rubric.Dim2), ReadAxis(result2, Rubric.Dim3), string.Empty);
            scores.Add(score);
            cases.Add(new StudyBuddyCase(g.Passage, steps, cost, score.Mean, Completed: true));
            totalSteps += steps;
            totalCost += cost;
        }

        var n = cases.Count;
        var judgeMean = scores.Count > 0 ? JudgeRunner.Aggregate(scores).MeanOverall : 0;
        var avgSteps = n > 0 ? (double)totalSteps / n : 0;
        var avgCost = n > 0 ? totalCost / n : 0m;

        logger.LogInformation(
            "Study Buddy eval edition={Edition} judge={Judge:0.00} avgSteps={Steps:0.0} avgCost=${Cost} (N={N})",
            editionId, judgeMean, avgSteps, avgCost, n);

        if (persist && db is not null)
        {
            db.EvalRuns.Add(new EvalRun
            {
                Id = Guid.NewGuid(),
                Feature = Feature,
                ModelId = "agent",
                JudgeModelId = judgeModelId,
                Score = Math.Round((decimal)judgeMean, 3),
                N = n,
                BreakdownJson = $"{{\"avgSteps\":{avgSteps:0.00},\"avgCostUsd\":{avgCost:0.0000},\"completed\":{cases.Count(c => c.Completed)}}}",
                GitSha = gitSha,
                CreatedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync(ct);
        }

        return new StudyBuddyEvalResult(judgeMean, avgSteps, avgCost, n, cases);
    }

    private static int ReadAxis(EvaluationResult result, string dim) =>
        (int)Math.Round(result.Get<NumericMetric>($"{Feature}.{dim.Split(':')[0].Trim()}").Value ?? 0);
}
