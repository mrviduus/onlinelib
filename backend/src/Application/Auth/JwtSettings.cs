namespace Application.Auth;

public class JwtSettings
{
    public const string SectionName = "Jwt";

    public required string SecretKey { get; set; }
    public string Issuer { get; set; } = "textstack.app";
    public int AccessTokenExpiryMinutes { get; set; } = 60;
    public int RefreshTokenExpiryDays { get; set; } = 30;
    // Guest sessions have a shorter lifetime to reduce DB bloat and abandoned-account accumulation.
    // Real users get 30 days; guests get 7 (matches industry avg, Pinterest=7d, Medium=30d).
    public int GuestRefreshTokenExpiryDays { get; set; } = 7;
}
