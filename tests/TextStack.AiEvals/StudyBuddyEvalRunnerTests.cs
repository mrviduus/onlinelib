using Application.Agents;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using TextStack.Ai.Agents;
using TextStack.Ai.Core;
using TextStack.Ai.EvalSuite;
using TextStack.Ai.Tools;

namespace TextStack.AiEvals;

/// <summary>
/// Deterministic coverage for <see cref="StudyBuddyEvalRunner"/> (AI-039): the agent runs on a fake
/// LLM that answers directly (no tools, one iteration), the judge is fixed — so the run scores the
/// golden set, aggregates the judge mean, and computes avg steps + cost without a key or corpus.
/// </summary>
public class StudyBuddyEvalRunnerTests
{
    private static readonly int GoldenN = StudyBuddyGoldenSet.Load().Count;

    /// <summary>Answers every prompt directly (no tool calls) with a fixed cost — one iteration per run.</summary>
    private sealed class DirectLlm : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct) =>
            Task.FromResult(new LlmResponse("A grounded explanation of the passage.", [], new LlmUsage(40, 20, 0.003m), "agent-model", Guid.NewGuid()));

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private sealed class FixedJudge(int d1, int d2, int d3) : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct) =>
            Task.FromResult(new LlmResponse(
                $"{{\"d1\": {d1}, \"d2\": {d2}, \"d3\": {d3}, \"rationale\": \"ok\"}}",
                [], new LlmUsage(0, 0, 0m), "judge", Guid.NewGuid()));

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private static StudyBuddyAgent Agent(ILlmService llm)
    {
        var registry = new ToolRegistry([]);
        return new StudyBuddyAgent(new AgentLoop(llm, registry, new ToolDispatcher(registry)));
    }

    [Fact]
    public async Task RunAsync_DirectAgent_ScoresGoldensAndAggregates()
    {
        var runner = new StudyBuddyEvalRunner(NullLogger<StudyBuddyEvalRunner>.Instance);

        var result = await runner.RunAsync(
            Agent(new DirectLlm()), new FixedJudge(5, 4, 5), "judge-test",
            Guid.NewGuid(), userId: null, new ServiceCollection().BuildServiceProvider(),
            persist: false, db: null, gitSha: null, TestContext.Current.CancellationToken);

        Assert.Equal(GoldenN, result.N);
        Assert.Equal((5 + 4 + 5) / 3.0, result.JudgeScore, 3); // every case scored 4.67
        Assert.Equal(1.0, result.AvgSteps, 3);                  // direct answer → one iteration each
        Assert.Equal(0.003m, result.AvgCostUsd);                // fixed per-run cost
        Assert.All(result.Cases, c => Assert.True(c.Completed));
    }
}
