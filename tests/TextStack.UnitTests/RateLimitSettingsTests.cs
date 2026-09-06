using Api.Extensions;
using Microsoft.Extensions.Configuration;

namespace TextStack.UnitTests;

/// <summary>
/// The guest-session limiter (3 creates / 5 min / IP) is deliberate for production but makes the
/// guest-merge integration suite impossible: it needs ≥6 guests and CI drives every request from
/// one host. The permit limit is therefore configurable — a knob, NOT a test-only bypass, so the
/// limiter itself stays on the same code path in CI as in production.
/// </summary>
public class RateLimitSettingsTests
{
    private static RateLimitSettings Bind(params (string Key, string Value)[] values)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(values.Select(v => new KeyValuePair<string, string?>(v.Key, v.Value)))
            .Build();

        return config.GetSection(RateLimitSettings.SectionName).Get<RateLimitSettings>()
            ?? new RateLimitSettings();
    }

    [Fact]
    public void GuestSessionPermitLimit_Unconfigured_IsProductionDefault()
    {
        var settings = Bind();

        Assert.Equal(3, settings.EffectiveGuestSessionPermitLimit);
        Assert.Equal(RateLimitSettings.DefaultGuestSessionPermitLimit, settings.EffectiveGuestSessionPermitLimit);
    }

    [Fact]
    public void GuestSessionPermitLimit_Configured_Overrides()
    {
        // The CI shape: RateLimits__GuestSessionPermitLimit=50 in compose env.
        var settings = Bind(("RateLimits:GuestSessionPermitLimit", "50"));

        Assert.Equal(50, settings.EffectiveGuestSessionPermitLimit);
    }

    [Fact]
    public void GuestSessionPermitLimit_ZeroOrNegative_DegradesToDefault()
    {
        // A configured 0 is a typo, and locking every client out of creating a session is an outage.
        Assert.Equal(3, Bind(("RateLimits:GuestSessionPermitLimit", "0")).EffectiveGuestSessionPermitLimit);
        Assert.Equal(3, Bind(("RateLimits:GuestSessionPermitLimit", "-1")).EffectiveGuestSessionPermitLimit);
    }

}
