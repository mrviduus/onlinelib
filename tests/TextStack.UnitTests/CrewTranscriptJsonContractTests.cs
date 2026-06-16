using System.Text.Json;
using TextStack.Ai.Agents;
using TextStack.Ai.Core;

namespace TextStack.UnitTests;

/// <summary>
/// AI-045 — end-to-end JSON casing contract between the persisted <c>agent_run.steps_json</c> and the
/// admin transcript parser (<c>AiQualityPage.tsx</c> StepTree / SubAgentPanel / CriticReview).
///
/// The writer (<c>DbAgentRunWriter</c>) serializes the step transcript with a bare
/// <c>JsonSerializer.Serialize(run.Steps)</c> — DEFAULT options, no naming policy. Under default STJ:
///   • record properties keep their PascalCase names (AgentStep → Index/Kind/Payload/At,
///     AgentUsage → Iterations/InputTokensTotal/OutputTokensTotal/CostUsdTotal/LatencyMs);
///   • anonymous objects keep their literal member names (camelCase: stage/agentName/status/usage/
///     error/steps and the inner llm_response payload's `text`).
///
/// The frontend reads exactly that MIXED casing. These tests serialize a realistic crew run through the
/// SAME factory + SAME default options and assert every key the frontend depends on, so the build breaks
/// if either side drifts (a mismatch = blank/raw transcript for every run in prod).
/// </summary>
public class CrewTranscriptJsonContractTests
{
    // Mirror DbAgentRunWriter exactly: JsonSerializer.Serialize(run.Steps) with no options.
    private static JsonElement SerializeSteps(IReadOnlyList<AgentStep> steps) =>
        JsonDocument.Parse(JsonSerializer.Serialize(steps)).RootElement;

    private static AgentStep LlmResponse(string text) =>
        new(0, "llm_response", JsonSerializer.SerializeToElement(new { text }), DateTimeOffset.UtcNow);

    private static CrewStepEntry SubAgent(int index, string stage, string name, string status, IReadOnlyList<AgentStep> steps) =>
        new(index, stage, name, status, steps, new AgentUsage(1, 100, 40, 0.0012m, 700), null);

    // A realistic 4-stage crew.autopublish run: researcher → drafter → critic → editor, critic carries a
    // JSON verdict in its llm_response.
    private static AgentRunRecord BuildCrewRun()
    {
        const string criticJson = """
            {"scores":{"factual_accuracy":4,"tone":5,"length":3,"banned_phrases":5},
             "issues":[{"severity":"major","axis":"length","message":"Too long."}]}
            """;
        var entries = new List<CrewStepEntry>
        {
            SubAgent(0, "research", "researcher", "completed", [LlmResponse("notes")]),
            SubAgent(1, "draft", "drafter", "completed", [LlmResponse("draft body")]),
            SubAgent(2, "critique", "critic", "completed", [LlmResponse(criticJson)]),
            SubAgent(3, "edit", "editor", "completed", [LlmResponse("final body")]),
        };
        var result = new CrewResult<string>(
            "final body", CrewRunRecordFactory.StatusCompleted, entries,
            new AgentUsage(4, 400, 160, 0.0048m, 2800), null);

        return CrewRunRecordFactory.From(
            Guid.NewGuid(), "autopublish", Guid.NewGuid(), Guid.NewGuid(),
            "goal text", "final body", result);
    }

    [Fact]
    public void TopLevelStep_UsesPascalCaseRecordKeys_KindAndPayload()
    {
        var steps = SerializeSteps(BuildCrewRun().Steps);

        var step0 = steps[0];
        // Frontend reads step.Kind and step.Payload (PascalCase — AgentStep record, default options).
        Assert.Equal("sub_agent", step0.GetProperty("Kind").GetString());
        Assert.True(step0.TryGetProperty("Payload", out _), "top step exposes PascalCase Payload");
        Assert.True(step0.TryGetProperty("Index", out _));
        // And NOT camelCase — guards against a future Web/camelCase option leaking onto the writer.
        Assert.False(step0.TryGetProperty("kind", out _), "must not be camelCase 'kind'");
        Assert.False(step0.TryGetProperty("payload", out _), "must not be camelCase 'payload'");
    }

    [Fact]
    public void SubAgentPayload_UsesCamelCaseAnonymousKeys()
    {
        var steps = SerializeSteps(BuildCrewRun().Steps);
        var payload = steps[2].GetProperty("Payload"); // critic

        // Frontend reads Payload.stage / .agentName / .status / .usage / .steps (camelCase anon members).
        Assert.Equal("critique", payload.GetProperty("stage").GetString());
        Assert.Equal("critic", payload.GetProperty("agentName").GetString());
        Assert.Equal("completed", payload.GetProperty("status").GetString());
        Assert.True(payload.TryGetProperty("usage", out _));
        Assert.Equal(JsonValueKind.Array, payload.GetProperty("steps").ValueKind);
    }

    [Fact]
    public void NestedUsage_UsesPascalCaseRecordKeys()
    {
        var steps = SerializeSteps(BuildCrewRun().Steps);
        var usage = steps[0].GetProperty("Payload").GetProperty("usage");

        // Frontend reads usage.Iterations / InputTokensTotal / OutputTokensTotal / CostUsdTotal / LatencyMs.
        Assert.Equal(1, usage.GetProperty("Iterations").GetInt32());
        Assert.Equal(100, usage.GetProperty("InputTokensTotal").GetInt32());
        Assert.Equal(40, usage.GetProperty("OutputTokensTotal").GetInt32());
        Assert.Equal(0.0012m, usage.GetProperty("CostUsdTotal").GetDecimal());
        Assert.Equal(700, usage.GetProperty("LatencyMs").GetInt32());
    }

    [Fact]
    public void InnerLlmResponseStep_PascalCaseKind_CamelCasePayloadText()
    {
        var steps = SerializeSteps(BuildCrewRun().Steps);
        var innerStep = steps[1].GetProperty("Payload").GetProperty("steps")[0]; // drafter's inner step

        // Frontend reads s.Kind (PascalCase) and s.Payload.text (camelCase).
        Assert.Equal("llm_response", innerStep.GetProperty("Kind").GetString());
        Assert.Equal("draft body", innerStep.GetProperty("Payload").GetProperty("text").GetString());
    }

    [Fact]
    public void CriticInnerText_IsValidJson_WithScoresAndIssues_FrontendKeys()
    {
        var steps = SerializeSteps(BuildCrewRun().Steps);
        var criticText = steps[2].GetProperty("Payload").GetProperty("steps")[0]
            .GetProperty("Payload").GetProperty("text").GetString();

        Assert.NotNull(criticText);
        using var verdict = JsonDocument.Parse(criticText!);
        var scores = verdict.RootElement.GetProperty("scores");
        // CriticReview reads snake_case score axes verbatim from the LLM text.
        Assert.Equal(4, scores.GetProperty("factual_accuracy").GetInt32());
        Assert.Equal(5, scores.GetProperty("tone").GetInt32());
        Assert.Equal(3, scores.GetProperty("length").GetInt32());
        Assert.Equal(5, scores.GetProperty("banned_phrases").GetInt32());

        var issue = verdict.RootElement.GetProperty("issues")[0];
        Assert.Equal("major", issue.GetProperty("severity").GetString());
        Assert.Equal("length", issue.GetProperty("axis").GetString());
        Assert.Equal("Too long.", issue.GetProperty("message").GetString());
    }
}
