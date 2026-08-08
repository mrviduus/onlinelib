using TextStack.Ai.Llm;

namespace TextStack.UnitTests;

/// <summary>
/// The breaker state machine. Pure functions with the clock as a parameter, mirroring
/// <see cref="AlarmThrottleTests"/> — this repo has no clock abstraction and these must test
/// without one.
///
/// The invariant that matters most is <c>JustTripped</c>: it is the entire "one event per
/// condition, not one per retry" requirement, and the reason a dead provider produced 30 duplicate
/// Sentry events before this existed.
/// </summary>
public class ProviderCircuitPolicyTests
{
    private static readonly DateTimeOffset T0 = new(2026, 8, 8, 12, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData(1, 1)]
    [InlineData(2, 5)]
    [InlineData(3, 30)]
    [InlineData(4, 30)]
    [InlineData(99, 30)]
    public void BackoffFor_FollowsLadderAndCapsAtLastRung(int consecutiveFailures, int expectedMinutes) =>
        Assert.Equal(
            TimeSpan.FromMinutes(expectedMinutes),
            ProviderCircuitPolicy.BackoffFor(consecutiveFailures));

    [Fact]
    public void BackoffFor_EmptyLadder_FallsBackToDefault() =>
        Assert.Equal(TimeSpan.FromMinutes(1), ProviderCircuitPolicy.BackoffFor(1, []));

    [Fact]
    public void OnFailure_FromClosed_OpensWithFirstRung()
    {
        var after = ProviderCircuitPolicy.OnFailure(ProviderCircuit.Closed, T0);

        Assert.Equal(1, after.ConsecutiveFailures);
        Assert.Equal(T0, after.OpenedAt);
        Assert.Equal(T0.AddMinutes(1), after.RetryAt);
    }

    [Fact]
    public void OnFailure_WhileOpen_EscalatesRungAndPreservesOpenedAt()
    {
        var first = ProviderCircuitPolicy.OnFailure(ProviderCircuit.Closed, T0);
        var second = ProviderCircuitPolicy.OnFailure(first, T0.AddMinutes(2));

        Assert.Equal(2, second.ConsecutiveFailures);
        Assert.Equal(T0, second.OpenedAt);
        Assert.Equal(T0.AddMinutes(7), second.RetryAt);
    }

    [Fact]
    public void OnSuccess_ResetsToClosed()
    {
        var open = ProviderCircuitPolicy.OnFailure(ProviderCircuit.Closed, T0);

        Assert.Equal(ProviderCircuit.Closed, ProviderCircuitPolicy.OnSuccess(open));
    }

    [Fact]
    public void IsOpen_BeforeRetryAt_True()
    {
        var open = ProviderCircuitPolicy.OnFailure(ProviderCircuit.Closed, T0);

        Assert.True(ProviderCircuitPolicy.IsOpen(open, T0.AddSeconds(59)));
    }

    [Fact]
    public void IsOpen_AtRetryAtBoundary_False()
    {
        var open = ProviderCircuitPolicy.OnFailure(ProviderCircuit.Closed, T0);

        Assert.False(ProviderCircuitPolicy.IsOpen(open, T0.AddMinutes(1)));
    }

    [Fact]
    public void IsHalfOpen_AtRetryAtBoundary_True()
    {
        var open = ProviderCircuitPolicy.OnFailure(ProviderCircuit.Closed, T0);

        Assert.True(ProviderCircuitPolicy.IsHalfOpen(open, T0.AddMinutes(1)));
    }

    [Fact]
    public void IsOpen_ClosedCircuit_False() =>
        Assert.False(ProviderCircuitPolicy.IsOpen(ProviderCircuit.Closed, T0));

    [Fact]
    public void JustTripped_ClosedToOpen_True()
    {
        var after = ProviderCircuitPolicy.OnFailure(ProviderCircuit.Closed, T0);

        Assert.True(ProviderCircuitPolicy.JustTripped(ProviderCircuit.Closed, after));
    }

    /// <summary>The "one Sentry event, not 30" invariant.</summary>
    [Fact]
    public void JustTripped_OnlyOnceAcrossAnOutage()
    {
        var circuit = ProviderCircuit.Closed;
        var trips = 0;

        for (var i = 0; i < 30; i++)
        {
            var before = circuit;
            circuit = ProviderCircuitPolicy.OnFailure(before, T0.AddMinutes(i));
            if (ProviderCircuitPolicy.JustTripped(before, circuit))
                trips++;
        }

        Assert.Equal(1, trips);
    }

    [Fact]
    public void JustRecovered_OpenToClosed_True()
    {
        var open = ProviderCircuitPolicy.OnFailure(ProviderCircuit.Closed, T0);
        var closed = ProviderCircuitPolicy.OnSuccess(open);

        Assert.True(ProviderCircuitPolicy.JustRecovered(open, closed));
    }

    [Fact]
    public void JustRecovered_SuccessWhileAlreadyClosed_False() =>
        Assert.False(ProviderCircuitPolicy.JustRecovered(
            ProviderCircuit.Closed, ProviderCircuitPolicy.OnSuccess(ProviderCircuit.Closed)));
}
