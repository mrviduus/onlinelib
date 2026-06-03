using System.Text.Json;

namespace TextStack.Ai.Core;

/// <summary>One step in an agent's execution trace. Kinds: "plan", "tool_call", "tool_result", "llm_response", "final".</summary>
public record AgentStep(
    int Index,
    string Kind,
    JsonElement Payload,
    DateTimeOffset At);

/// <summary>Per-run agent context: who is the user, which edition/run id, and a scoped service provider for tools.</summary>
public record AgentContext(
    Guid? UserId,
    Guid? EditionId,
    Guid AgentRunId,
    IServiceProvider Services);

/// <summary>Final outcome of an agent run: output value, the full step list, and accumulated usage.</summary>
public record AgentResult<T>(T Output, IReadOnlyList<AgentStep> Steps, AgentUsage Usage);

/// <summary>Aggregated cost/latency/iteration counters for one agent run.</summary>
public record AgentUsage(
    int Iterations,
    int InputTokensTotal,
    int OutputTokensTotal,
    decimal CostUsdTotal,
    int LatencyMs);

/// <summary>
/// Per-invocation input for the generic <see cref="AgentLoop"/> sketched in the playbook. Carries the user goal,
/// allowed tools, system prompt and feature tag. Concrete agents may wrap this in a domain-specific record.
/// </summary>
public record AgentInput(
    string UserGoal,
    string SystemPrompt,
    IReadOnlyList<string> AllowedTools,
    string FeatureTag);

/// <summary>Knobs that bound an agent loop: max iterations, per-step tokens, per-run cost cap.</summary>
public record AgentLoopOptions(
    int MaxSteps = 6,
    int MaxTokensPerStep = 1024,
    decimal? CostCapUsd = null);

/// <summary>Thrown when an agent reaches <see cref="AgentLoopOptions.MaxSteps"/> or its cost cap without terminating.</summary>
public sealed class AgentBudgetExhaustedException : Exception
{
    public AgentBudgetExhaustedException() : base("Agent budget exhausted.") { }
    public AgentBudgetExhaustedException(string message) : base(message) { }
    public AgentBudgetExhaustedException(string message, Exception innerException) : base(message, innerException) { }
}
