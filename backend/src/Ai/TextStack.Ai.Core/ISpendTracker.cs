namespace TextStack.Ai.Core;

/// <summary>
/// Tracks today's (UTC) LLM spend per <c>FeatureTag</c> so the ModelGateway can enforce a
/// per-feature daily budget (Phase 12 RLOps). Process-local, in-memory + lock-free: both
/// members are on the LLM hot path and the fire-and-forget completion path, so they MUST
/// NEVER throw. On any failure or unknown feature, <see cref="SpentTodayUsd"/> returns 0
/// (fail-open: a tracker glitch must never block a paid feature). Implementation lives in
/// Application (it lazily seeds from the sampled <c>llm_traces</c> table on a fresh scope).
/// </summary>
public interface ISpendTracker
{
    /// <summary>Approximate USD spent today (UTC) for the feature. 0 on any failure or
    /// unknown feature. Hot path — never throws.</summary>
    decimal SpentTodayUsd(string featureTag);

    /// <summary>Add the cost of one completed call to today's running total for the feature.
    /// Fire-and-forget caller — never throws.</summary>
    void Record(string featureTag, decimal costUsd);
}
