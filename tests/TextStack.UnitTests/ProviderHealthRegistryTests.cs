using Microsoft.Extensions.Logging.Abstractions;
using TextStack.Ai.Llm;

namespace TextStack.UnitTests;

/// <summary>
/// The circuit registry: who is allowed to call, who gets alerted, and how often.
/// Uses a recording alarm rather than Sentry — same approach as `RecordingRouteAlarm`.
/// </summary>
public class ProviderHealthRegistryTests
{
    private static readonly DateTimeOffset T0 = new(2026, 8, 8, 12, 0, 0, TimeSpan.Zero);
    private const string Provider = "ollama";

    private sealed class RecordingAlarm : IProviderHealthAlarm
    {
        public List<(string Provider, string? Tag, string Reason, TimeSpan RetryAfter)> Opened { get; } = [];
        public List<(string Provider, IReadOnlyList<string> Tags, string Detail)> Startup { get; } = [];

        public void OnCircuitOpened(string providerKey, string? featureTag, string reason, TimeSpan retryAfter) =>
            Opened.Add((providerKey, featureTag, reason, retryAfter));

        public void OnUnreachableAtStartup(string providerKey, IReadOnlyList<string> featureTags, string detail) =>
            Startup.Add((providerKey, featureTags, detail));
    }

    private static (ProviderHealthRegistry Registry, RecordingAlarm Alarm) Build()
    {
        var alarm = new RecordingAlarm();
        return (new ProviderHealthRegistry(alarm, NullLogger<ProviderHealthRegistry>.Instance), alarm);
    }

    [Fact]
    public void TryBeginCall_UnknownProvider_Allows()
    {
        var (registry, _) = Build();

        Assert.True(registry.TryBeginCall(Provider, T0));
    }

    [Fact]
    public void ReportFailure_OpensCircuit_BlocksSubsequentCalls()
    {
        var (registry, _) = Build();
        registry.ReportFailure(Provider, "bookmeta", LlmFailureAlarm.ReasonTransport, T0);

        Assert.False(registry.TryBeginCall(Provider, T0.AddSeconds(30)));
        Assert.False(registry.IsAvailable(Provider, T0.AddSeconds(30)));
    }

    /// <summary>
    /// The half-open slot is claimed atomically: many concurrent callers at the same instant must
    /// produce exactly ONE real request, or recovery would stampede the provider that just died.
    /// </summary>
    [Fact]
    public void TryBeginCall_AtRetryAt_LetsExactlyOneProbeThrough()
    {
        var (registry, _) = Build();
        registry.ReportFailure(Provider, "bookmeta", LlmFailureAlarm.ReasonTransport, T0);

        var allowed = Enumerable.Range(0, 20).Count(_ => registry.TryBeginCall(Provider, T0.AddMinutes(1)));

        Assert.Equal(1, allowed);
    }

    [Fact]
    public void ReportSuccess_AfterProbe_ResumesTraffic()
    {
        var (registry, _) = Build();
        registry.ReportFailure(Provider, "bookmeta", LlmFailureAlarm.ReasonTransport, T0);
        registry.TryBeginCall(Provider, T0.AddMinutes(1));

        registry.ReportSuccess(Provider, T0.AddMinutes(1));

        Assert.True(registry.IsAvailable(Provider, T0.AddMinutes(1)));
        Assert.Equal(ProviderCircuit.Closed, registry.Snapshot(Provider));
    }

    [Fact]
    public void ReportFailure_Repeated_AlarmsExactlyOnce()
    {
        var (registry, alarm) = Build();

        for (var i = 0; i < 30; i++)
            registry.ReportFailure(Provider, "bookmeta", LlmFailureAlarm.ReasonTransport, T0.AddMinutes(i));

        Assert.Single(alarm.Opened);
        Assert.Equal(Provider, alarm.Opened[0].Provider);
        Assert.Equal(LlmFailureAlarm.ReasonTransport, alarm.Opened[0].Reason);
    }

    [Fact]
    public void Recovery_DoesNotAlarm()
    {
        var (registry, alarm) = Build();
        registry.ReportFailure(Provider, "bookmeta", LlmFailureAlarm.ReasonTransport, T0);

        registry.ReportSuccess(Provider, T0.AddMinutes(1));

        Assert.Single(alarm.Opened);
    }

    /// <summary>Batch gating must be able to ask "is it up?" without burning the probe slot.</summary>
    [Fact]
    public void IsAvailable_DoesNotConsumeProbeSlot()
    {
        var (registry, _) = Build();
        registry.ReportFailure(Provider, "bookmeta", LlmFailureAlarm.ReasonTransport, T0);

        Assert.True(registry.IsAvailable(Provider, T0.AddMinutes(1)));
        Assert.True(registry.IsAvailable(Provider, T0.AddMinutes(1)));
        Assert.True(registry.TryBeginCall(Provider, T0.AddMinutes(1)));
    }

    [Fact]
    public void ReportFailure_OnHalfOpenProbe_EscalatesBackoff()
    {
        var (registry, _) = Build();
        registry.ReportFailure(Provider, "bookmeta", LlmFailureAlarm.ReasonTransport, T0);
        registry.TryBeginCall(Provider, T0.AddMinutes(1));
        registry.ReportFailure(Provider, "bookmeta", LlmFailureAlarm.ReasonTransport, T0.AddMinutes(1));

        Assert.Equal(2, registry.Snapshot(Provider).ConsecutiveFailures);
        Assert.Equal(T0.AddMinutes(6), registry.Snapshot(Provider).RetryAt);
    }

    [Fact]
    public void OtherProviders_AreUnaffected()
    {
        var (registry, _) = Build();
        registry.ReportFailure(Provider, "bookmeta", LlmFailureAlarm.ReasonTransport, T0);

        Assert.True(registry.IsAvailable("openai-explain", T0));
    }

    /// <summary>The kill switch must be inert in every direction.</summary>
    [Fact]
    public void NullProviderHealth_AlwaysAllows()
    {
        var health = NullProviderHealth.Instance;
        health.ReportFailure(Provider, "bookmeta", LlmFailureAlarm.ReasonTransport, T0);

        Assert.True(health.TryBeginCall(Provider, T0));
        Assert.True(health.IsAvailable(Provider, T0));
        Assert.Equal(ProviderCircuit.Closed, health.Snapshot(Provider));
    }
}
