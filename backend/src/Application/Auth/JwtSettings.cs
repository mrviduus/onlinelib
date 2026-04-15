namespace Application.Auth;

public class JwtSettings
{
    public const string SectionName = "Jwt";

    public required string SecretKey { get; set; }
    public string Issuer { get; set; } = "textstack.app";
    public int AccessTokenExpiryMinutes { get; set; } = 60;
    public int RefreshTokenExpiryDays { get; set; } = 30;
    // Guest cookie outlives the cleanup TTL (30d) so an engaged user who comes back after a few
    // weeks still has a valid session and the guest-row promotion path stays in-place (no merge).
    public int GuestRefreshTokenExpiryDays { get; set; } = 30;
}
