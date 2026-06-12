using System.Runtime.CompilerServices;
using System.Text.Json;
using TextStack.Ai.Core;

namespace TextStack.Ai.Tools;

/// <summary>
/// One round of function-calling over any <see cref="ILlmService"/> (Phase 5, AI-031b): send the
/// request with tool schemas; if the model answers directly, that's the result; if it requests tools,
/// dispatch them (validated, parallel — failures come back as data) and ask once more WITHOUT tools
/// for the grounded final answer. Single round by design — the multi-step plan/act/observe loop is
/// Phase 6's <c>AgentLoop</c>.
/// </summary>
public sealed class ToolCallingSession(ToolDispatcher dispatcher)
{
    /// <summary>
    /// Streams the answer. Round-1 text deltas are re-yielded as they arrive (the no-tool case stays
    /// fully streaming); tool-call deltas are collected, dispatched, and the follow-up round streams
    /// the final answer. Usage deltas from both rounds pass through (the tracer reads them).
    /// </summary>
    /// <param name="onToolRound">
    /// Fired (before round 2) when the model requested tools — callers use it to mark the answer
    /// tool-grounded (e.g. Explain must NOT write such answers to its shared cache: tool output can be
    /// user-specific, so caching it would leak across users).
    /// </param>
    public async IAsyncEnumerable<LlmDelta> StreamAsync(
        ILlmService llm, LlmRequest request, ToolContext ctx,
        Action? onToolRound = null, [EnumeratorCancellation] CancellationToken ct = default)
    {
        var toolCalls = new List<ToolCall>();
        var round1Text = string.Empty;

        await foreach (var delta in llm.StreamAsync(request, ct))
        {
            if (delta.ToolCallDelta is { } call)
            {
                toolCalls.Add(call);
                continue; // tool plumbing is not client-visible
            }
            if (delta.TextDelta is { } text)
                round1Text += text;
            yield return delta;
        }

        if (toolCalls.Count == 0)
            yield break; // model answered directly

        onToolRound?.Invoke();
        var followUp = await BuildFollowUpAsync(request, round1Text, toolCalls, ctx, ct);
        await foreach (var delta in llm.StreamAsync(followUp, ct))
            yield return delta;
    }

    /// <summary>One-shot variant (the JSON path): same round semantics, full text back.
    /// <c>UsedTools</c> tells the caller whether the answer is tool-grounded (→ not cacheable).</summary>
    public async Task<(LlmResponse Response, bool UsedTools)> CompleteAsync(
        ILlmService llm, LlmRequest request, ToolContext ctx, CancellationToken ct)
    {
        var response = await llm.CompleteAsync(request, ct);
        if (response.ToolCalls.Count == 0)
            return (response, false);

        var followUp = await BuildFollowUpAsync(request, response.Text, response.ToolCalls, ctx, ct);
        return (await llm.CompleteAsync(followUp, ct), true);
    }

    /// <summary>
    /// Dispatches the requested calls and builds the round-2 request: original messages + the
    /// assistant's tool-call turn + one tool-result message per call (failures included, as data).
    /// Round 2 carries NO tool schemas — it must answer, not call again.
    /// </summary>
    private async Task<LlmRequest> BuildFollowUpAsync(
        LlmRequest request, string assistantText, IReadOnlyList<ToolCall> toolCalls,
        ToolContext ctx, CancellationToken ct)
    {
        var results = await dispatcher.DispatchAllAsync(toolCalls, ctx, ct);

        var messages = new List<LlmMessage>(request.Messages)
        {
            new("assistant", assistantText, toolCalls),
        };
        for (var i = 0; i < toolCalls.Count; i++)
        {
            messages.Add(new LlmMessage("tool", SerializeResult(results[i]), [toolCalls[i]]));
        }

        return request with { Messages = messages, Tools = null };
    }

    /// <summary>The payload the model sees for one tool result — the output, or the error as data.</summary>
    public static string SerializeResult(ToolResult result) =>
        result.Ok
            ? result.Result!.Value.GetRawText()
            : JsonSerializer.Serialize(new { error = result.Error });
}
