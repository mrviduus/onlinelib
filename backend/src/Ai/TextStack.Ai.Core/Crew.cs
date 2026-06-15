namespace TextStack.Ai.Core;

/// <summary>
/// What a crew task hands back: its transcript <see cref="Result"/> (recorded in declaration order)
/// plus a deferred <see cref="Fold"/> the orchestrator runs single-threaded, in declaration order,
/// after Task.WhenAll. Fold is null when the task did not complete (budget/error) — nothing to apply.
/// The fold NEVER runs inside the parallel body; that is what keeps shared-state mutation non-racy.
/// </summary>
public readonly record struct CrewTaskOutcome(CrewTaskResult Result, Action? Fold);

/// <summary>
/// One unit of work in a crew (AI-040): runs a sub-agent (or any logic) against the shared
/// <typeparamref name="TState"/> and returns a <see cref="CrewTaskOutcome"/>. Built by helpers in
/// <c>CrewTasks</c>; the orchestrator never folds inside a task — see <c>CrewTasks.Of</c> for the
/// declaration-ordered, non-racy fold contract.
/// </summary>
public delegate Task<CrewTaskOutcome> CrewTask<TState>(TState state, AgentContext ctx, CancellationToken ct);

/// <summary>
/// Outcome of one crew task: which sub-agent ran, its terminal <see cref="Status"/>
/// ("completed" | "budget_exhausted" | "error"), its step transcript, accumulated usage and any error.
/// Deliberately NOT generic over the agent output — the typed output is folded into the shared state by
/// the orchestrator (via the <see cref="CrewTaskOutcome.Fold"/>, in declaration order), not carried here.
/// </summary>
public record CrewTaskResult(
    string AgentName,
    string Status,
    IReadOnlyList<AgentStep> Steps,
    AgentUsage Usage,
    string? Error);

/// <summary>
/// One stage of a crew plan. A stage with a single task runs sequentially; a stage with multiple tasks
/// fans out in parallel (bounded by <see cref="CrewOptions.MaxParallelism"/>). Stages always run in order.
/// </summary>
public record CrewStage<TState>(string Name, IReadOnlyList<CrewTask<TState>> Tasks);

/// <summary>Knobs bounding a crew run: an optional cumulative cost cap and a parallel fan-out limit.</summary>
public record CrewOptions(decimal? CostCapUsd = null, int MaxParallelism = 4);

/// <summary>A full crew plan: named stages (run in order) plus the bounding <see cref="CrewOptions"/>.</summary>
public record CrewPlan<TState>(string Name, IReadOnlyList<CrewStage<TState>> Stages, CrewOptions Options);

/// <summary>
/// One sub-agent invocation in a crew's transcript — the crew-level analogue of an <see cref="AgentStep"/>.
/// <see cref="Index"/> is the running invocation counter across the whole crew; <see cref="Steps"/> is the
/// sub-agent's own transcript, nested for replay.
/// </summary>
public record CrewStepEntry(
    int Index,
    string Stage,
    string AgentName,
    string Status,
    IReadOnlyList<AgentStep> Steps,
    AgentUsage Usage,
    string? Error);

/// <summary>
/// Terminal outcome of a crew run: the (mutated) shared <see cref="State"/>, the crew <see cref="Status"/>
/// ("completed" | "budget_exhausted" | "error"), the full sub-agent transcript, aggregated usage summed
/// across every sub-agent, and any crew-terminating error.
/// </summary>
public record CrewResult<TState>(
    TState State,
    string Status,
    IReadOnlyList<CrewStepEntry> Steps,
    AgentUsage Usage,
    string? Error);
