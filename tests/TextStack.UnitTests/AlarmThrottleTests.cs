using TextStack.Ai.Llm;

namespace TextStack.UnitTests;

/// <summary>
/// The throttle behind the Sentry route/provider alarms. Not a nicety: `pdf.parse` resolves a route
/// ONCE PER PAGE with parallelism 6, so the 106-page book from the 2026-07-14 silent-fallback
/// incident would raise 106 identical events without this. First hit must still fire immediately —
/// a bad deploy has to be visible within one page, not after a cooldown.
/// </summary>
public class AlarmThrottleTests
{
    private static readonly DateTimeOffset T0 = new(2026, 8, 6, 12, 0, 0, TimeSpan.Zero);
    private static readonly TimeSpan Cooldown = TimeSpan.FromMinutes(60);

    [Fact]
    public void ShouldFire_NothingFiredYet_ReturnsTrue() =>
        Assert.True(AlarmThrottle.ShouldFire(T0, lastFired: null, Cooldown));

    [Fact]
    public void ShouldFire_WithinCooldown_ReturnsFalse() =>
        Assert.False(AlarmThrottle.ShouldFire(T0.AddMinutes(59), T0, Cooldown));

    [Fact]
    public void ShouldFire_AtCooldownBoundary_ReturnsTrue() =>
        Assert.True(AlarmThrottle.ShouldFire(T0.AddMinutes(60), T0, Cooldown));

    [Fact]
    public void TryEnter_FirstCall_Claims()
    {
        var throttle = new AlarmThrottle(Cooldown);

        Assert.True(throttle.TryEnter("pdf.parse|ollama", T0));
    }

    [Fact]
    public void TryEnter_RepeatedWithinCooldown_ClaimsOnce()
    {
        var throttle = new AlarmThrottle(Cooldown);
        var claims = 0;

        // One page-parallel PDF book's worth of calls.
        for (var i = 0; i < 106; i++)
        {
            if (throttle.TryEnter("pdf.parse|ollama", T0.AddSeconds(i)))
                claims++;
        }

        Assert.Equal(1, claims);
    }

    [Fact]
    public void TryEnter_AfterCooldown_ClaimsAgain()
    {
        var throttle = new AlarmThrottle(Cooldown);
        throttle.TryEnter("pdf.parse|ollama", T0);

        Assert.True(throttle.TryEnter("pdf.parse|ollama", T0.AddMinutes(61)));
    }

    [Fact]
    public void TryEnter_DifferentKey_IsNotThrottled()
    {
        var throttle = new AlarmThrottle(Cooldown);
        throttle.TryEnter("pdf.parse|ollama", T0);

        Assert.True(throttle.TryEnter("rag.summarize|ollama", T0));
    }
}
