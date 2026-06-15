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

    private static AgentContext CtxNoUser() =>
        new(null, Guid.NewGuid(), Guid.NewGuid(), new ServiceCollection().BuildServiceProvider());

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
    public async Task Stream_FeedsSameConfig_EmitsStepThenDone()
    {
        var llm = new FixedLlm("Streamed explanation.");
        var agent = new StudyBuddyAgent(Loop(llm));

        var events = new List<AgentEvent>();
        await foreach (var e in agent.StreamAsync(
            new StudyBuddyInput("A confusing passage.", Guid.NewGuid(), ChapterNumber: 2),
            Ctx(), TestContext.Current.CancellationToken))
        {
            events.Add(e);
        }

        var done = Assert.Single(events.Where(e => e.Result is not null));
        Assert.Equal("Streamed explanation.", done.Result!.Output);
        Assert.Equal(StudyBuddyAgent.SystemPrompt, llm.Requests[0].SystemPrompt);
        Assert.Contains("Chapter 2", llm.Requests[0].Messages[0].Content);
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

    // ----- AI-039: per-run deterministic tool gate (ResolveTools) -----

    /// <summary>
    /// No-op tools whose names are all the gate/registry needs to surface a schema. Each has a
    /// parameterless ctor and a unique non-blank name so the DI tool-scan in <c>ToolRegistryTests</c>
    /// stays happy if it sweeps them up.
    /// </summary>
    private abstract class FakeTool : ITool
    {
        public abstract string Name { get; }
        public string Description => Name;
        public JsonElement ArgsSchema => JsonDocument.Parse("{}").RootElement;
        public Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct) =>
            Task.FromResult(JsonDocument.Parse("{}").RootElement);
    }

    private sealed class GetChapterTool : FakeTool { public override string Name => "get_chapter"; }
    private sealed class GetChapterSummaryTool : FakeTool { public override string Name => "get_chapter_summary"; }
    private sealed class SearchBookTool : FakeTool { public override string Name => "search_book"; }
    private sealed class FindEarlierDefinitionTool : FakeTool { public override string Name => "find_earlier_definition"; }
    private sealed class GetUserHighlightsTool : FakeTool { public override string Name => "get_user_highlights"; }
    private sealed class GetUserVocabularyTool : FakeTool { public override string Name => "get_user_vocabulary"; }

    /// <summary>Loop whose registry knows every Study Buddy tool, so offered names resolve to real schemas.</summary>
    private static AgentLoop LoopWithAllTools(ILlmService llm)
    {
        var registry = new ToolRegistry([
            new GetChapterTool(),
            new GetChapterSummaryTool(),
            new SearchBookTool(),
            new FindEarlierDefinitionTool(),
            new GetUserHighlightsTool(),
            new GetUserVocabularyTool(),
        ]);
        return new AgentLoop(llm, registry, new ToolDispatcher(registry));
    }

    [Fact]
    public async Task Run_SelfContainedPassage_OffersNoTools()
    {
        var llm = new FixedLlm("Direct answer from the passage.");
        var agent = new StudyBuddyAgent(LoopWithAllTools(llm));

        await agent.RunAsync(
            new StudyBuddyInput("Serializable snapshot isolation is an optimistic concurrency control technique.",
                Guid.NewGuid(), ChapterNumber: 7),
            Ctx(), TestContext.Current.CancellationToken);

        // No lexical signal → the request carries no tool schemas, so the model cannot over-call.
        Assert.Null(Assert.Single(llm.Requests).Tools);
    }

    [Fact]
    public async Task Run_ChapterReferencePassage_OffersChapterTools()
    {
        var llm = new FixedLlm("Answer.");
        var agent = new StudyBuddyAgent(LoopWithAllTools(llm));

        await agent.RunAsync(
            new StudyBuddyInput("This builds on the model from Chapter 5, so see Chapter 5 for the setup.",
                Guid.NewGuid(), ChapterNumber: 9),
            Ctx(), TestContext.Current.CancellationToken);

        var tools = Assert.Single(llm.Requests).Tools;
        Assert.NotNull(tools);
        var names = tools!.Select(t => t.Name).ToList();
        Assert.Contains("get_chapter", names);
        Assert.Contains("get_chapter_summary", names);
        Assert.DoesNotContain("search_book", names);
        Assert.DoesNotContain("get_user_highlights", names);
    }

    [Fact]
    public async Task Run_HighlightsPassageNoUser_OmitsUserTools()
    {
        var llm = new FixedLlm("Answer.");
        var agent = new StudyBuddyAgent(LoopWithAllTools(llm));

        await agent.RunAsync(
            new StudyBuddyInput("Compare this with my highlights and my notes on the topic.",
                Guid.NewGuid(), ChapterNumber: null),
            CtxNoUser(), TestContext.Current.CancellationToken);

        // UserHighlights signal present, but no signed-in user → no tools offered at all.
        Assert.Null(Assert.Single(llm.Requests).Tools);
    }

    [Fact]
    public async Task Run_HighlightsPassageWithUser_OffersUserTools()
    {
        var llm = new FixedLlm("Answer.");
        var agent = new StudyBuddyAgent(LoopWithAllTools(llm));

        await agent.RunAsync(
            new StudyBuddyInput("Compare this with my highlights and my notes on the topic.",
                Guid.NewGuid(), ChapterNumber: null),
            Ctx(), TestContext.Current.CancellationToken);

        var tools = Assert.Single(llm.Requests).Tools;
        Assert.NotNull(tools);
        var names = tools!.Select(t => t.Name).ToList();
        Assert.Contains("get_user_highlights", names);
        Assert.Contains("get_user_vocabulary", names);
        Assert.DoesNotContain("get_chapter", names);
    }
}
