namespace TextStack.Ai.Llm;

/// <summary>Immutable breaker state for one provider key. <see cref="Closed"/> is the default.</summary>
public readonly record struct ProviderCircuit(
    int ConsecutiveFailures,
    DateTimeOffset? OpenedAt,
    DateTimeOffset? RetryAt)
{
    public static readonly ProviderCircuit Closed = new(0, null, null);
}

/// <summary>
/// The breaker's state machine, as pure functions taking <c>now</c> as a parameter — the same
/// clock-free shape as <see cref="AlarmThrottle"/>, so it unit-tests without a clock abstraction, a
/// Sentry hub or a DI container (this repo has no <c>TimeProvider</c> anywhere).
///
/// Purpose: an unreachable provider must cost ~0 per call instead of a full
/// <c>Ollama:TimeoutSeconds</c> (90 s), and must produce ONE alert rather than one per retry.
/// </summary>
public static class ProviderCircuitPolicy
{
    /// <summary>1 min → 5 min → 30 min, then capped at the last rung.</summary>
    public static readonly IReadOnlyList<TimeSpan> DefaultBackoff =
        [TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(30)];

    /// <summary>Backoff for the Nth consecutive failure (1-based), clamped to the last rung.</summary>
    public static TimeSpan BackoffFor(int consecutiveFailures, IReadOnlyList<TimeSpan>? ladder = null)
    {
        var rungs = ladder is { Count: > 0 } ? ladder : DefaultBackoff;
        var index = Math.Clamp(consecutiveFailures - 1, 0, rungs.Count - 1);
        return rungs[index];
    }

    /// <summary>
    /// Records a transport failure. <c>OpenedAt</c> is preserved across escalations — that is what
    /// makes <see cref="JustTripped"/> true exactly once per outage, and it is the whole of the
    /// "one event per condition, not one per retry" requirement.
    /// </summary>
    public static ProviderCircuit OnFailure(
        ProviderCircuit current, DateTimeOffset now, IReadOnlyList<TimeSpan>? ladder = null)
    {
        var failures = current.ConsecutiveFailures + 1;
        return new ProviderCircuit(failures, current.OpenedAt ?? now, now + BackoffFor(failures, ladder));
    }

    public static ProviderCircuit OnSuccess(ProviderCircuit current) => ProviderCircuit.Closed;

    /// <summary>Open and not yet due for a probe — callers must skip.</summary>
    public static bool IsOpen(ProviderCircuit circuit, DateTimeOffset now) =>
        circuit.RetryAt is { } retryAt && now < retryAt;

    /// <summary>Open and due — exactly one caller should be let through to probe.</summary>
    public static bool IsHalfOpen(ProviderCircuit circuit, DateTimeOffset now) =>
        circuit.RetryAt is { } retryAt && now >= retryAt;

    /// <summary>Closed → Open. The single Sentry event fires only on this edge.</summary>
    public static bool JustTripped(ProviderCircuit before, ProviderCircuit after) =>
        before.OpenedAt is null && after.OpenedAt is not null;

    /// <summary>Open → Closed. Info log only, never an event.</summary>
    public static bool JustRecovered(ProviderCircuit before, ProviderCircuit after) =>
        before.OpenedAt is not null && after.OpenedAt is null;
}
