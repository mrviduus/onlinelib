namespace Api.Extensions;

/// <summary>
/// The rate-limiter values that are not compiled in. Bound from the <c>RateLimits</c> section
/// (env: <c>RateLimits__GuestSessionPermitLimit</c>), mirroring <c>JwtSettings</c>.
/// </summary>
/// <remarks>
/// Only knobs that a deployment genuinely has to move live here — everything else stays a literal
/// in <c>AddTextStackRateLimiting</c>, where it is readable next to the comment explaining it.
/// </remarks>
public sealed class RateLimitSettings
{
    public const string SectionName = "RateLimits";

    /// <summary>Guest-session creates allowed per IP per 5-minute window. Production default is 3.</summary>
    /// <remarks>
    /// CI raises this via compose env because the guest-merge integration suite needs ≥6 guests and
    /// every request in CI comes from one host. Deliberately NOT a test-only bypass: the limiter must
    /// be on the same code path in CI as in production, or a regression in the limiter itself would
    /// never fail a test.
    /// </remarks>
    public int GuestSessionPermitLimit { get; set; } = DefaultGuestSessionPermitLimit;

    public const int DefaultGuestSessionPermitLimit = 3;

    /// <summary>A configured 0 or negative is a typo, and locking every client out of guest sessions
    /// is an outage — degrade to the production default instead of to zero.</summary>
    public int EffectiveGuestSessionPermitLimit =>
        GuestSessionPermitLimit > 0 ? GuestSessionPermitLimit : DefaultGuestSessionPermitLimit;

}
