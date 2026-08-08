using System.Collections.Concurrent;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace TextStack.Ai.Llm;

/// <summary>
/// Per-provider circuit state. Consulted before a call (so a dead provider costs ~0 instead of a
/// 90 s timeout) and before a background batch (so rows are not claimed into a terminal state while
/// the provider that would fill them is down).
///
/// It NEVER participates in routing. Nothing here can switch a task to a different provider —
/// that stays 100% <c>Ai:Routes</c>-driven. Silently rerouting an outage onto a paid provider is
/// the 2026-07-14 incident with the arrow reversed, and it is explicitly out of scope.
/// </summary>
public interface IProviderHealth
{
    /// <summary>
    /// True if the caller may make a REAL call. Atomically claims the half-open probe slot, so
    /// exactly one caller probes per backoff window.
    /// </summary>
    bool TryBeginCall(string providerKey, DateTimeOffset now);

    void ReportSuccess(string providerKey, DateTimeOffset now);

    void ReportFailure(string providerKey, string? featureTag, string reason, DateTimeOffset now);

    /// <summary>Read-only availability for batch gating. Does NOT consume the probe slot.</summary>
    bool IsAvailable(string providerKey, DateTimeOffset now);

    ProviderCircuit Snapshot(string providerKey);
}

/// <summary>Reports circuit transitions. Separate seam so tests record instead of hitting Sentry —
/// same shape as <see cref="IRouteAlarm"/>.</summary>
public interface IProviderHealthAlarm
{
    void OnCircuitOpened(string providerKey, string? featureTag, string reason, TimeSpan retryAfter);

    void OnUnreachableAtStartup(string providerKey, IReadOnlyList<string> featureTags, string detail);
}

/// <summary>Always-available no-op. Used when <c>Ai:ProviderHealth:Enabled=false</c> (the kill
/// switch restores byte-for-byte the previous behaviour) and as the default for hand-constructed
/// clients in the eval suite.</summary>
public sealed class NullProviderHealth : IProviderHealth
{
    public static readonly NullProviderHealth Instance = new();

    public bool TryBeginCall(string providerKey, DateTimeOffset now) => true;
    public void ReportSuccess(string providerKey, DateTimeOffset now) { }
    public void ReportFailure(string providerKey, string? featureTag, string reason, DateTimeOffset now) { }
    public bool IsAvailable(string providerKey, DateTimeOffset now) => true;
    public ProviderCircuit Snapshot(string providerKey) => ProviderCircuit.Closed;
}

/// <summary>
/// In-memory, per-process circuit registry — the same lifetime model as <c>RollingSpendTracker</c>.
/// The API and the Worker therefore discover a dead provider independently, which is deliberate: no
/// shared store, no new infrastructure, and each host's breaker reflects its own reachability.
/// </summary>
public sealed class ProviderHealthRegistry(
    IProviderHealthAlarm alarm,
    ILogger<ProviderHealthRegistry> logger,
    IReadOnlyList<TimeSpan>? backoffLadder = null) : IProviderHealth
{
    private readonly ConcurrentDictionary<string, ProviderCircuit> _circuits =
        new(StringComparer.OrdinalIgnoreCase);

    private readonly IReadOnlyList<TimeSpan> _ladder =
        backoffLadder is { Count: > 0 } ? backoffLadder : ProviderCircuitPolicy.DefaultBackoff;

    public ProviderCircuit Snapshot(string providerKey) =>
        _circuits.TryGetValue(providerKey, out var c) ? c : ProviderCircuit.Closed;

    public bool IsAvailable(string providerKey, DateTimeOffset now) =>
        !ProviderCircuitPolicy.IsOpen(Snapshot(providerKey), now);

    public bool TryBeginCall(string providerKey, DateTimeOffset now)
    {
        var allowed = false;

        _circuits.AddOrUpdate(
            providerKey,
            _ =>
            {
                allowed = true;
                return ProviderCircuit.Closed;
            },
            (_, current) =>
            {
                if (ProviderCircuitPolicy.IsOpen(current, now))
                    return current;

                if (ProviderCircuitPolicy.IsHalfOpen(current, now))
                {
                    // Claim the probe: push RetryAt forward so concurrent callers see "open" and
                    // exactly one request goes to the wire per window. The probe IS a real call —
                    // no separate prober loop to keep in sync.
                    allowed = true;
                    return current with
                    {
                        RetryAt = now + ProviderCircuitPolicy.BackoffFor(current.ConsecutiveFailures, _ladder),
                    };
                }

                allowed = true;
                return current;
            });

        return allowed;
    }

    public void ReportSuccess(string providerKey, DateTimeOffset now)
    {
        var before = Snapshot(providerKey);
        var after = ProviderCircuitPolicy.OnSuccess(before);
        _circuits[providerKey] = after;

        if (ProviderCircuitPolicy.JustRecovered(before, after))
            logger.LogInformation(
                "AI provider '{Provider}' recovered — resuming background work", providerKey);
    }

    public void ReportFailure(string providerKey, string? featureTag, string reason, DateTimeOffset now)
    {
        ProviderCircuit before = default, after = default;

        _circuits.AddOrUpdate(
            providerKey,
            _ =>
            {
                before = ProviderCircuit.Closed;
                after = ProviderCircuitPolicy.OnFailure(before, now, _ladder);
                return after;
            },
            (_, current) =>
            {
                before = current;
                after = ProviderCircuitPolicy.OnFailure(current, now, _ladder);
                return after;
            });

        var retryAfter = (after.RetryAt ?? now) - now;

        if (ProviderCircuitPolicy.JustTripped(before, after))
        {
            logger.LogError(
                "AI provider '{Provider}' circuit OPEN after a {Reason} failure on '{Feature}' — "
                + "skipping its background work for {RetryAfter}",
                providerKey, reason, featureTag ?? "unknown", retryAfter);
            alarm.OnCircuitOpened(providerKey, featureTag, reason, retryAfter);
        }
        else
        {
            // Subsequent failures are logs/breadcrumbs only — the whole point is one signal per
            // condition, not one per retry.
            logger.LogDebug(
                "AI provider '{Provider}' still failing ({Reason}, {Failures} consecutive) — "
                + "next retry in {RetryAfter}",
                providerKey, reason, after.ConsecutiveFailures, retryAfter);
        }
    }
}

/// <summary>
/// Sends circuit transitions to Sentry. Fingerprints are explicit and keyed only on
/// (event kind, provider) — without that, <c>CaptureMessage</c> groups on the rendered message,
/// which contains the volatile task list and retry duration, so every route edit would spawn a new
/// issue and "resolved in release" would never stick. Throttled as a second line of defence against
/// a flapping provider. Never throws: reporting a failure must not cause one.
/// </summary>
public sealed class SentryProviderHealthAlarm : IProviderHealthAlarm
{
    private readonly AlarmThrottle _throttle;

    public SentryProviderHealthAlarm(IConfiguration config)
    {
        var cooldownMinutes = config.GetValue<int?>("Ai:RouteAlarm:CooldownMinutes") ?? 60;
        _throttle = new AlarmThrottle(TimeSpan.FromMinutes(Math.Max(1, cooldownMinutes)));
    }

    public void OnCircuitOpened(string providerKey, string? featureTag, string reason, TimeSpan retryAfter)
    {
        if (!_throttle.TryEnter($"provider-health|open|{providerKey}", DateTimeOffset.UtcNow))
            return;

        Send(
            $"AI provider '{providerKey}' is failing at the transport level ({reason}) — "
            + $"its background work is paused for {retryAfter}.",
            scope =>
            {
                scope.SetFingerprint(["ai-provider-circuit-open", providerKey]);
                scope.SetTag("ai.provider", providerKey);
                scope.SetTag("ai.task", featureTag ?? "unknown");
                scope.SetTag("ai.failure", "circuit_open");
            });
    }

    public void OnUnreachableAtStartup(string providerKey, IReadOnlyList<string> featureTags, string detail)
    {
        if (!_throttle.TryEnter($"provider-health|startup|{providerKey}", DateTimeOffset.UtcNow))
            return;

        Send(
            $"AI provider '{providerKey}' was unreachable at startup ({detail}). "
            + $"Tasks routed to it will not run: {string.Join(", ", featureTags)}.",
            scope =>
            {
                scope.SetFingerprint(["ai-provider-unreachable-at-startup", providerKey]);
                scope.SetTag("ai.provider", providerKey);
                scope.SetTag("ai.failure", "unreachable_at_startup");
                // Sentry caps tag values; the full list goes in extra.
                scope.SetTag("ai.task", featureTags.Count > 0 ? featureTags[0] : "unknown");
                scope.SetExtra("ai.tasks", string.Join(", ", featureTags));
            });
    }

    private static void Send(string message, Action<Scope> enrich)
    {
        try
        {
            SentrySdk.CaptureMessage(message, enrich, SentryLevel.Warning);
        }
        catch
        {
            // ignored
        }
    }
}
