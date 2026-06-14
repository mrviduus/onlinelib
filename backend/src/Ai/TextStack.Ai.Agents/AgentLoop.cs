using System.Diagnostics;
using System.Text.Json;
using TextStack.Ai.Core;
using TextStack.Ai.Tools;

namespace TextStack.Ai.Agents;

/// <summary>
/// The hand-rolled plan → act → observe loop (Phase 6, AI-034) every concrete agent runs on. Each
/// iteration: ask the model (with the agent's allowed tool schemas); if it answers without a tool
/// call, that's the final answer; otherwise dispatch the requested tools (validated, in parallel,
/// failures returned as data so the agent can recover) and feed the results back for the next turn.
/// Bounded by <see cref="AgentLoopOptions"/> — a hard iteration cap AND an optional cumulative cost
/// cap — so it can never loop forever or burn the budget; exhausting either throws
/// <see cref="AgentBudgetExhaustedException"/>. Every turn is recorded as an <see cref="AgentStep"/>
/// for a transparent, persistable transcript. Generic over any <see cref="ILlmService"/> + tool set;
/// concrete agents (e.g. StudyBuddy, AI-035) just supply the prompt, allowed tools and options.
/// </summary>
public sealed class AgentLoop(ILlmService llm, IToolRegistry tools, ToolDispatcher dispatcher)
{
    public async Task<AgentResult<string>> RunAsync(
        AgentInput input, AgentContext ctx, AgentLoopOptions options, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var steps = new List<AgentStep>();
        var messages = new List<LlmMessage> { new("user", input.UserGoal) };
        var toolSchemas = tools.SchemasFor(input.AllowedTools);
        var toolCtx = new ToolContext(ctx.UserId, ctx.EditionId, ctx.AgentRunId, ctx.Services);

        int inputTokens = 0, outputTokens = 0;
        decimal cost = 0m;

        for (var iteration = 0; iteration < options.MaxSteps; iteration++)
        {
            ct.ThrowIfCancellationRequested();

            var request = new LlmRequest(
                input.SystemPrompt, messages, options.MaxTokensPerStep,
                Tools: toolSchemas.Count > 0 ? toolSchemas : null, FeatureTag: input.FeatureTag);

            var response = await llm.CompleteAsync(request, ct);
            inputTokens += response.Usage.InputTokens;
            outputTokens += response.Usage.OutputTokens;
            cost += response.Usage.CostUsd;
            steps.Add(Step(iteration, "llm_response", SerializeResponse(response)));

            // No tool calls → the model has produced its final answer.
            if (response.ToolCalls.Count == 0)
            {
                sw.Stop();
                return new AgentResult<string>(
                    response.Text, steps,
                    new AgentUsage(iteration + 1, inputTokens, outputTokens, cost, (int)sw.ElapsedMilliseconds));
            }

            // The assistant's tool-call turn must precede the tool results (OpenAI message ordering).
            messages.Add(new LlmMessage("assistant", response.Text, response.ToolCalls));

            var results = await dispatcher.DispatchAllAsync(response.ToolCalls, toolCtx, ct);
            for (var j = 0; j < response.ToolCalls.Count; j++)
            {
                var call = response.ToolCalls[j];
                var result = results[j];
                steps.Add(Step(iteration, "tool_result", SerializeResult(call, result)));
                // Errors come back as data (ToolCallingSession serialization) so the model can recover.
                messages.Add(new LlmMessage("tool", ToolCallingSession.SerializeResult(result), [call]));
            }

            // Cost cap is checked AFTER the step completes, so a useful partial transcript is kept.
            if (options.CostCapUsd is { } cap && cost >= cap)
                throw new AgentBudgetExhaustedException(
                    $"Agent cost cap ${cap} exceeded after {iteration + 1} iteration(s) (${cost}).",
                    steps,
                    new AgentUsage(iteration + 1, inputTokens, outputTokens, cost, (int)sw.ElapsedMilliseconds));
        }

        throw new AgentBudgetExhaustedException(
            $"Agent reached MaxSteps={options.MaxSteps} without a final answer.",
            steps,
            new AgentUsage(options.MaxSteps, inputTokens, outputTokens, cost, (int)sw.ElapsedMilliseconds));
    }

    private static AgentStep Step(int iteration, string kind, JsonElement payload) =>
        new(iteration, kind, payload, DateTimeOffset.UtcNow);

    /// <summary>Compact JSON view of one model turn for the step transcript (text + requested calls).</summary>
    private static JsonElement SerializeResponse(LlmResponse response) =>
        JsonSerializer.SerializeToElement(new
        {
            text = response.Text,
            toolCalls = response.ToolCalls.Select(c => new { name = c.ToolName, args = c.Arguments }),
        });

    /// <summary>Compact JSON view of one tool outcome for the step transcript.</summary>
    private static JsonElement SerializeResult(ToolCall call, ToolResult result) =>
        JsonSerializer.SerializeToElement(new
        {
            tool = call.ToolName,
            args = call.Arguments,
            ok = result.Ok,
            result = result.Result,
            error = result.Error,
        });
}
