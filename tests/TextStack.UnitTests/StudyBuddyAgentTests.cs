using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Application.Agents;
using TextStack.Ai.Agents;
using TextStack.Ai.Core;
using TextStack.Ai.Tools;

namespace TextStack.UnitTests;

/// <summary>
/// AI-035 — the StudyBuddyAgent wiring over the real <see cref="AgentLoop"/> with a fake LLM: it feeds
/// the loop its system prompt, the allowed tool set, and a goal built from the passage + chapter, and
/// returns the loop's answer.
/// </summary>
public class StudyBuddyAgentTests
{
    private sealed class FixedLlm(string reply) : ILlmService
    {
        public List<LlmRequest> Requests { get; } = [];

        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            Requests.Add(request);
            return Task.FromResult(new LlmResponse(reply, [], new LlmUsage(1, 1, 0m), "m", Guid.NewGuid()));
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private static AgentLoop Loop(ILlmService llm)
    {
        var registry = new ToolRegistry([]);
        return new AgentLoop(llm, registry, new ToolDispatcher(registry));
    }

    private static AgentContext Ctx() =>
        new(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), new ServiceCollection().BuildServiceProvider());

    [Fact]
    public async Task Run_FeedsPromptAndPassageGoal_ReturnsAnswer()
    {
        var llm = new FixedLlm("Here is the explanation.");
        var agent = new StudyBuddyAgent(Loop(llm));

        var result = await agent.RunAsync(
            new StudyBuddyInput("A quorum protects reads from stale replicas.", Guid.NewGuid(), ChapterNumber: 3),
            Ctx(), TestContext.Current.CancellationToken);

        Assert.Equal("Here is the explanation.", result.Output);

        var request = Assert.Single(llm.Requests);
        Assert.Equal(StudyBuddyAgent.SystemPrompt, request.SystemPrompt);
        Assert.Equal(StudyBuddyAgent.FeatureTag, request.FeatureTag);
        Assert.Contains("A quorum protects reads", request.Messages[0].Content);
        Assert.Contains("Chapter 3", request.Messages[0].Content); // chapter threaded into the goal
    }

    [Fact]
    public async Task Run_NoChapter_GoalOmitsChapter()
    {
        var llm = new FixedLlm("Explanation.");
        var agent = new StudyBuddyAgent(Loop(llm));

        await agent.RunAsync(
            new StudyBuddyInput("Some passage.", Guid.NewGuid(), ChapterNumber: null),
            Ctx(), TestContext.Current.CancellationToken);

        Assert.DoesNotContain("Chapter", llm.Requests[0].Messages[0].Content);
    }
}
