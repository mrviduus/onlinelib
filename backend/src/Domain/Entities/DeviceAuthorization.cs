namespace Domain.Entities;

/// <summary>
/// OAuth 2.0 Device Authorization Grant (RFC 8628) record. Backs the headless
/// MCP CLI device-grant flow: the CLI requests a device_code + user_code, the
/// user approves the user_code from an authenticated browser session, then the
/// CLI redeems the device_code for a per-user TextStack JWT.
///
/// Security: the long device_code secret is stored SHA256-hashed (never plain),
/// mirroring <see cref="PasswordResetToken"/>. The user_code is short/low-entropy
/// — security rests on the authenticated approve step + 10-minute TTL + rate
/// limiting, not on user_code entropy.
/// </summary>
public class DeviceAuthorization
{
    public Guid Id { get; set; }

    /// <summary>SHA256-hex of the long device_code secret handed to the CLI.</summary>
    public string DeviceCodeHash { get; set; } = "";

    /// <summary>Short user-facing code, grouped "XXXX-XXXX" (Crockford base32, no I/O/0/1).</summary>
    public string UserCode { get; set; } = "";

    /// <summary>Null until the row is approved by an authenticated user.</summary>
    public Guid? UserId { get; set; }

    /// <summary>pending | approved | denied | expired</summary>
    public string Status { get; set; } = DeviceAuthorizationStatus.Pending;

    public DateTimeOffset ExpiresAt { get; set; }
    public int IntervalSeconds { get; set; } = 5;
    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>Set when the device_code is redeemed for tokens (single-use marker).</summary>
    public DateTimeOffset? ConsumedAt { get; set; }

    public User? User { get; set; }
}

public static class DeviceAuthorizationStatus
{
    public const string Pending = "pending";
    public const string Approved = "approved";
    public const string Denied = "denied";
    public const string Expired = "expired";
}
