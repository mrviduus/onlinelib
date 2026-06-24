using System.Text.Json;
using Application.Agents;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Agents;
using TextStack.Ai.Core;
using TextStack.Ai.Tools;

namespace TextStack.UnitTests;

/// <summary>
/// AI-Agent-2 TutorAgent — the anti-hallucination invariant (every planned wordId must trace to a card a tool
/// actually returned), the final-JSON → grounded plan mapping (re-projection of word + SRS stage from the
/// retrieved row, exercise recalibration from the real stage, de-dup, cap), the deterministic stage→exercise
/// calibration, and the loop wiring driven by a scripted fake LLM + fake card tools (plan, re-plan, budget
/// exhaustion).
/// </summary>
public class TutorAgentTests
{
    private static readonly JsonElement AnySchema = JsonDocument.Parse("""{"type":"object"}""").RootElement;
    private static JsonElement Json(string json) => JsonDocument.Parse(json).RootElement;

    private const string W1 = "11111111-1111-1111-1111-111111111111";
    private const string W2 = "22222222-2222-2222-2222-222222222222";
    private const string W3 = "33333333-3333-3333-3333-333333333333";

    /// <summary>Builds a tool_result step payload exactly like AgentLoop.SerializeResult does.</summary>
    private static AgentStep ToolResultStep(string tool, string resultJson, bool ok = true) =>
        new(0, "tool_result", JsonSerializer.SerializeToElement(new
        {
            tool,
            args = new { },
            ok,
            result = JsonDocument.Parse(resultJson).RootElement,
            error = (string?)null,
        }), DateTimeOffset.UtcNow);

    // stage 1 (recognition/easy), stage 2 (recall/medium), stage 4 with sentence (context/hard).
    private static readonly string DueResult = $$"""
        {"count":3,"words":[
          {"wordId":"{{W1}}","word":"ostensibly","stage":1,"consecutiveCorrect":0,"lastAccuracy":0.3,"hasSentence":true},
          {"wordId":"{{W2}}","word":"ephemeral","stage":2,"consecutiveCorrect":1,"lastAccuracy":0.5,"hasSentence":true},
          {"wordId":"{{W3}}","word":"ineffable","stage":4,"consecutiveCorrect":2,"lastAccuracy":0.8,"hasSentence":true}
        ]}
        """;

    // ---- RetrievedCards.FromSteps + Parse grounding (pure) -------------------------------------------

    [Fact]
    public void Parse_ItemsReferencingRetrievedCards_AreKeptAndReprojected()
    {
        var retrieved = RetrievedCards.FromSteps([ToolResultStep("get_due_vocabulary", DueResult)]);
        // Model echoes a WRONG word + the WRONG exercise for W1 — parser must re-project word + recalibrate.
        var answer = $$"""
            {"plan":[
              {"wordId":"{{W1}}","exerciseType":"context","difficulty":"hard","why":"weak word"}
            ],"rationale":"focus on weak words","readingNudge":"keep reading"}
            """;

        var plan = TutorAgent.Parse(answer, retrieved, maxItems: 5);

        var item = Assert.Single(plan.Items);
        Assert.Equal(Guid.Parse(W1), item.WordId);
        Assert.Equal("ostensibly", item.Word);                               // re-projected
        Assert.Equal(1, item.Stage);                                          // re-projected
        Assert.Equal(TutorPlanItem.ExerciseRecognition, item.ExerciseType);   // recalibrated from stage 1, not model's "context"
        Assert.Equal(TutorPlanItem.DifficultyEasy, item.Difficulty);
    }

    [Fact]
    public void Parse_InventedWordId_IsDropped()
    {
        var retrieved = RetrievedCards.FromSteps([ToolResultStep("get_due_vocabulary", DueResult)]);
        var answer = """
            {"plan":[
              {"wordId":"99999999-9999-9999-9999-999999999999","exerciseType":"recall","difficulty":"medium","why":"invented"}
            ],"rationale":"x","readingNudge":"read"}
            """;

        Assert.Empty(TutorAgent.Parse(answer, retrieved, 5).Items); // id never retrieved → hallucination dropped
    }

    [Fact]
    public void Parse_ItemWithNoWordId_IsDropped()
    {
        var retrieved = RetrievedCards.FromSteps([ToolResultStep("get_due_vocabulary", DueResult)]);
        var answer = """{"plan":[{"exerciseType":"recall","why":"no id"}],"rationale":"x","readingNudge":"r"}""";
        Assert.Empty(TutorAgent.Parse(answer, retrieved, 5).Items);
    }

    [Fact]
    public void Parse_DuplicateWordId_DeDuped()
    {
        var retrieved = RetrievedCards.FromSteps([ToolResultStep("get_weak_vocabulary", DueResult)]);
        var answer = $$"""
            {"plan":[
              {"wordId":"{{W1}}","exerciseType":"recognition","why":"a"},
              {"wordId":"{{W1}}","exerciseType":"recognition","why":"b"}
            ],"rationale":"x","readingNudge":"r"}
            """;
        Assert.Single(TutorAgent.Parse(answer, retrieved, 5).Items);
    }

    [Fact]
    public void Parse_OverLongPlan_CappedToMaxItems()
    {
        var retrieved = RetrievedCards.FromSteps([ToolResultStep("get_due_vocabulary", DueResult)]);
        var answer = $$"""
            {"plan":[
              {"wordId":"{{W1}}","why":"a"},{"wordId":"{{W2}}","why":"b"},{"wordId":"{{W3}}","why":"c"}
            ],"rationale":"x","readingNudge":"r"}
            """;
        // Cap below the available cards: only the first survives.
        Assert.Single(TutorAgent.Parse(answer, retrieved, maxItems: 1).Items);
    }

    [Fact]
    public void Parse_Garbage_ReturnsEmptyPlanWithRawRationale()
    {
        var plan = TutorAgent.Parse("Sorry, I couldn't build a plan.", RetrievedCards.Empty, 5);
        Assert.Empty(plan.Items);
        Assert.Contains("couldn't build", plan.Rationale);
    }

    [Fact]
    public void FromSteps_FailedToolResult_ContributesNothing()
    {
        var retrieved = RetrievedCards.FromSteps([ToolResultStep("get_due_vocabulary", DueResult, ok: false)]);
        Assert.Equal(0, retrieved.Count);
        Assert.False(retrieved.TryGet(Guid.Parse(W1), out _));
    }

    // ---- Deterministic stage → exercise calibration (pure) ------------------------------------------

    [Theory]
    [InlineData(0, true, TutorPlanItem.ExerciseRecognition, TutorPlanItem.DifficultyEasy)]
    [InlineData(1, true, TutorPlanItem.ExerciseRecognition, TutorPlanItem.DifficultyEasy)]
    [InlineData(2, true, TutorPlanItem.ExerciseRecall, TutorPlanItem.DifficultyMedium)]
    [InlineData(3, true, TutorPlanItem.ExerciseContext, TutorPlanItem.DifficultyHard)]
    [InlineData(4, true, TutorPlanItem.ExerciseContext, TutorPlanItem.DifficultyHard)]
    public void CalibrateForStage_MatchesStageBand(int stage, bool hasSentence, string exType, string diff)
    {
        var card = new RetrievedCard(Guid.NewGuid(), "w", stage, 0, 0.5, hasSentence);
        var (type, difficulty) = TutorAgent.CalibrateForStage(card);
        Assert.Equal(exType, type);
        Assert.Equal(diff, difficulty);
    }

    [Fact]
    public void CalibrateForStage_ContextStageWithoutSentence_DowngradesToRecall()
    {
        var card = new RetrievedCard(Guid.NewGuid(), "w", Stage: 4, 0, 0.5, HasSentence: false);
        var (type, difficulty) = TutorAgent.CalibrateForStage(card);
        Assert.Equal(TutorPlanItem.ExerciseRecall, type);          // no sentence → not a broken cloze
        Assert.Equal(TutorPlanItem.DifficultyMedium, difficulty);
    }

    // ---- The loop (scripted LLM + fake card tools) --------------------------------------------------

    private sealed class FakeTool : ITool
    {
        public string Name { get; init; } = "fake-tutor-agent-tool";
        public string Json { get; init; } = "{}";
        public string Description => "fake";
        public JsonElement ArgsSchema => AnySchema;
        public Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct) =>
            Task.FromResult(JsonDocument.Parse(Json).RootElement);
    }

    private sealed class ScriptedLlm(params object[][] turns) : ILlmService
    {
        private int _turn;
        public List<LlmRequest> Requests { get; } = [];

        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            Requests.Add(request);
            var entries = _turn < turns.Length ? turns[_turn] : ["{}"];
            _turn++;
            var text = string.Concat(entries.OfType<string>());
            var calls = entries.OfType<ToolCall>().ToList();
            return Task.FromResult(new LlmResponse(text, calls, new LlmUsage(10, 5, 0.001m), "m", Guid.NewGuid()));
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private static TutorAgent Agent(ILlmService llm, params ITool[] tools)
    {
        var registry = new ToolRegistry(tools);
        return new TutorAgent(new AgentLoop(llm, registry, new ToolDispatcher(registry)));
    }

    private static AgentContext Ctx() =>
        new(Guid.NewGuid(), null, Guid.NewGuid(), new ServiceCollection().BuildServiceProvider());

    private static ToolCall Call(string name, string args = "{}") => new("c1", name, Json(args));

    [Fact]
    public async Task RunAsync_FetchThenPlan_GroundsItemsInToolResults()
    {
        var llm = new ScriptedLlm(
            [Call("get_due_vocabulary", """{"limit":5}""")],   // turn 1: fetch due cards
            [$$"""
              {"plan":[
                {"wordId":"{{W1}}","exerciseType":"recognition","difficulty":"easy","why":"due + weak"},
                {"wordId":"{{W2}}","exerciseType":"recall","difficulty":"medium","why":"due"}
              ],"rationale":"two due cards","readingNudge":"keep reading 1984"}
              """]);                                            // turn 2: plan
        var agent = Agent(llm, new FakeTool { Name = "get_due_vocabulary", Json = DueResult });

        var outcome = await agent.RunAsync(new TutorInput(5), Ctx(), TestContext.Current.CancellationToken);

        Assert.Equal(1, outcome.ToolCallsCount);
        Assert.Equal(2, outcome.Plan.Items.Count);
        Assert.Equal("ostensibly", outcome.Plan.Items[0].Word);
        Assert.Contains("reading", outcome.Plan.ReadingNudge, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task RunAsync_ModelPlansWithoutFetching_ResultIsEmpty()
    {
        // Skips tools, fabricates a plan → grounding drops it (no tool result to back it).
        var llm = new ScriptedLlm(
            [$$"""{"plan":[{"wordId":"{{W1}}","exerciseType":"recall","why":"made up"}],"rationale":"x","readingNudge":"r"}"""]);
        var agent = Agent(llm, new FakeTool { Name = "get_due_vocabulary", Json = DueResult });

        var outcome = await agent.RunAsync(new TutorInput(5), Ctx(), TestContext.Current.CancellationToken);

        Assert.Equal(0, outcome.ToolCallsCount);
        Assert.Empty(outcome.Plan.Items); // anti-hallucination: nothing retrieved ⇒ nothing planned
    }

    [Fact]
    public async Task RunAsync_FeedbackTurn_ReplansAndIncludesMissedCardInGoal()
    {
        var llm = new ScriptedLlm(
            [Call("get_due_vocabulary", """{"limit":5}""")],
            [$$"""{"plan":[{"wordId":"{{W2}}","exerciseType":"recall","why":"re-surface miss"}],"rationale":"missed it","readingNudge":"read"}"""]);
        var agent = Agent(llm, new FakeTool { Name = "get_due_vocabulary", Json = DueResult });

        // Learner got W1 right (fast) and W2 wrong — the re-plan turn should re-surface the missed W2.
        var feedback = new List<TutorFeedbackItem>
        {
            new(Guid.Parse(W1), Correct: true, ResponseTimeMs: 800),
            new(Guid.Parse(W2), Correct: false, ResponseTimeMs: 5000),
        };
        var outcome = await agent.RunAsync(new TutorInput(5, feedback), Ctx(), TestContext.Current.CancellationToken);

        // The re-plan goal carries the learner's results so the model can adapt (the user goal is the first message).
        var goal = llm.Requests[0].Messages[0].Content;
        Assert.Contains(W2, goal);
        Assert.Contains("WRONG", goal);
        Assert.Contains("Re-plan", goal, StringComparison.OrdinalIgnoreCase);

        var item = Assert.Single(outcome.Plan.Items);
        Assert.Equal(Guid.Parse(W2), item.WordId); // the missed card re-surfaces, grounded in the tool result
    }

    [Fact]
    public async Task RunAsync_LoopNeverPlans_ThrowsBudgetExhaustedWithTranscript()
    {
        var llm = new ScriptedLlm(
            [Call("get_due_vocabulary")], [Call("get_due_vocabulary")],
            [Call("get_due_vocabulary")], [Call("get_due_vocabulary")]);
        var agent = Agent(llm, new FakeTool { Name = "get_due_vocabulary", Json = DueResult });

        var ex = await Assert.ThrowsAsync<AgentBudgetExhaustedException>(() =>
            agent.RunAsync(new TutorInput(5), Ctx(), TestContext.Current.CancellationToken));

        Assert.NotEmpty(ex.Steps);
    }
}
