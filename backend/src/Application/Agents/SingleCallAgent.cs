using System.Diagnostics;
using System.Text.Json;
using TextStack.Ai.Core;

namespace Application.Agents;

/// <summary>
/// Base for a crew specialist that is exactly ONE <see cref="ILlmService"/> gateway call (Phase 7, AI-041)
/// — no tools, no AgentLoop, no iteration. The crew (AI-042/043) composes these via <c>CrewTasks.Of</c>, so
/// each must satisfy the same <see cref="IAgent{TIn,TOut}"/> contract the orchestrator schedules: produce a
/// step transcript (one "llm_response" step) and a usage row (Iterations = 1) mapped from the gateway's
/// <see cref="LlmUsage"/>. Subclasses own only their feature tag (routing), token budget, prompt and parse —
/// the gateway plumbing (request, timing, step, usage) lives here so the four specialists stay ~15 lines each.
/// </summary>
public abstract class SingleCallAgent<TIn, TOut>(ILlmService llm) : IAgent<TIn, TOut>
{
    /// <summary>Routes the call (model selection, tracing, cost caps) — one tag per specialist.</summary>
    protected abstract string FeatureTag { get; }

    /// <summary>Output-token budget for this specialist's single completion.</summary>
    protected abstract int MaxOutputTokens { get; }

    /// <summary>Builds the system + user prompt for this input. Pure string production (delegates to a Prompts builder).</summary>
    protected abstract (string system, string user) BuildPrompt(TIn input);

    /// <summary>Turns the raw completion text into the typed output (trim / parse). Must never throw — fail-closed instead.</summary>
    protected abstract TOut Parse(string text, TIn input);

    public async Task<AgentResult<TOut>> RunAsync(TIn input, AgentContext ctx, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();

        var (system, user) = BuildPrompt(input);
        var resp = await llm.CompleteAsync(
            new LlmRequest(system, [new LlmMessage("user", user)], MaxOutputTokens, FeatureTag: FeatureTag),
            ct);
        sw.Stop();

        var step = new AgentStep(
            0,
            "llm_response",
            JsonSerializer.SerializeToElement(new { text = resp.Text }),
            DateTimeOffset.UtcNow);

        var usage = new AgentUsage(
            1,
            resp.Usage.InputTokens,
            resp.Usage.OutputTokens,
            resp.Usage.CostUsd,
            (int)sw.ElapsedMilliseconds);

        return new AgentResult<TOut>(Parse(resp.Text, input), [step], usage);
    }
}
