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

/// <summary>
/// Thrown when an agent reaches <see cref="AgentLoopOptions.MaxSteps"/> or its cost cap without
/// terminating. Carries the partial <see cref="Steps"/> transcript and <see cref="Usage"/> accumulated
/// before the budget ran out — a budget-exhausted run is exactly the one worth inspecting, so it can be
/// persisted (AI-036) instead of lost. The legacy constructors default these to empty.
/// </summary>
public sealed class AgentBudgetExhaustedException : Exception
{
    private static readonly AgentUsage EmptyUsage = new(0, 0, 0, 0m, 0);

    public IReadOnlyList<AgentStep> Steps { get; }
    public AgentUsage Usage { get; }

    public AgentBudgetExhaustedException(string message, IReadOnlyList<AgentStep> steps, AgentUsage usage)
        : base(message)
    {
        Steps = steps;
        Usage = usage;
    }

    public AgentBudgetExhaustedException() : base("Agent budget exhausted.")
    {
        Steps = [];
        Usage = EmptyUsage;
    }

    public AgentBudgetExhaustedException(string message) : base(message)
    {
        Steps = [];
        Usage = EmptyUsage;
    }

    public AgentBudgetExhaustedException(string message, Exception innerException) : base(message, innerException)
    {
        Steps = [];
        Usage = EmptyUsage;
    }
}

/// <summary>
/// A finished agent run ready to persist (AI-036): identity + who/what it ran for, the terminal
/// <see cref="Status"/> ("completed" | "budget_exhausted" | "error"), the final answer (if any), the
/// full step transcript and accumulated usage. Framework-free so the writer interface lives in Core.
/// </summary>
public record AgentRunRecord(
    Guid Id,
    string Agent,
    Guid? UserId,
    Guid? EditionId,
    string Goal,
    string Status,
    string? Output,
    IReadOnlyList<AgentStep> Steps,
    AgentUsage Usage,
    string? Error,
    DateTimeOffset CreatedAt,
    /// <summary>Agent-reported overall confidence (0–1), when the agent calibrates one. Null otherwise (telemetry).</summary>
    double? Confidence = null,
    /// <summary>Number of tool calls the run made (telemetry). Defaults 0 for tool-less / unset runs.</summary>
    int ToolCallsCount = 0);

/// <summary>Persists an <see cref="AgentRunRecord"/> (e.g. to Postgres) so the UI can replay the agent's steps.</summary>
public interface IAgentRunWriter
{
    Task WriteAsync(AgentRunRecord run, CancellationToken ct);
}
