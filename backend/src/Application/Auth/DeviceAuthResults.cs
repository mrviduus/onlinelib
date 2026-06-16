using Domain.Entities;

namespace Application.Auth;

/// <summary>Result of <see cref="AuthService.CreateDeviceAuthorizationAsync"/>.</summary>
/// <param name="DeviceCode">Plaintext device_code (returned once, stored hashed).</param>
/// <param name="UserCode">Short user-facing code "XXXX-XXXX".</param>
/// <param name="ExpiresInSeconds">RFC 8628 expires_in.</param>
/// <param name="IntervalSeconds">RFC 8628 polling interval.</param>
public record DeviceCodeResult(string DeviceCode, string UserCode, int ExpiresInSeconds, int IntervalSeconds);

/// <summary>Outcome of approving/denying a device authorization by user_code.</summary>
public enum DeviceApprovalResult
{
    Ok,
    NotFound,
    Expired,
    AlreadyUsed
}

/// <summary>RFC 8628 §3.5 token-endpoint outcomes for a device_code poll.</summary>
public enum DeviceRedeemStatus
{
    Approved,
    AuthorizationPending,
    ExpiredToken,
    AccessDenied
}

/// <summary>
/// Discriminated result the device token endpoint maps to RFC 8628 errors.
/// On <see cref="DeviceRedeemStatus.Approved"/> the token fields are populated.
/// </summary>
public sealed record DeviceRedeemResult(
    DeviceRedeemStatus Status,
    User? User = null,
    string? AccessToken = null,
    string? RefreshToken = null)
{
    public static DeviceRedeemResult Success(User user, string accessToken, string refreshToken) =>
        new(DeviceRedeemStatus.Approved, user, accessToken, refreshToken);

    public static DeviceRedeemResult AuthorizationPending() => new(DeviceRedeemStatus.AuthorizationPending);
    public static DeviceRedeemResult ExpiredToken() => new(DeviceRedeemStatus.ExpiredToken);
    public static DeviceRedeemResult AccessDenied() => new(DeviceRedeemStatus.AccessDenied);
}
