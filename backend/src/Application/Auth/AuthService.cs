using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Application.Common.Interfaces;
using Domain.Entities;
using Google.Apis.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Application.Auth;

public class AuthService
{
    private readonly IAppDbContext _db;
    private readonly JwtSettings _jwtSettings;
    private readonly GoogleSettings _googleSettings;
    private readonly AppleSettings? _appleSettings;

    public AuthService(
        IAppDbContext db,
        IOptions<JwtSettings> jwtSettings,
        IOptions<GoogleSettings> googleSettings,
        IOptions<AppleSettings>? appleSettings = null)
    {
        _db = db;
        _jwtSettings = jwtSettings.Value;
        _googleSettings = googleSettings.Value;
        _appleSettings = appleSettings?.Value;
    }

    public async Task<(User user, string accessToken, string refreshToken)> TestLoginAsync(
        string email,
        CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Email == email, ct);
        if (user == null)
        {
            user = new User
            {
                Id = Guid.NewGuid(),
                Email = email,
                Name = email.Split('@')[0],
                GoogleSubject = null,
                CreatedAt = DateTimeOffset.UtcNow
            };
            _db.Users.Add(user);
            await _db.SaveChangesAsync(ct);
        }

        var accessToken = GenerateAccessToken(user);
        var refreshToken = await CreateRefreshTokenAsync(user.Id, ct);
        return (user, accessToken, refreshToken);
    }

    public async Task<(User user, string accessToken, string refreshToken)?> LoginWithGoogleAsync(
        string googleIdToken,
        CancellationToken ct)
    {
        GoogleJsonWebSignature.Payload payload;
        try
        {
            payload = await GoogleJsonWebSignature.ValidateAsync(googleIdToken, new GoogleJsonWebSignature.ValidationSettings
            {
                Audience = [_googleSettings.ClientId]
            });
        }
        catch (InvalidJwtException)
        {
            return null;
        }

        var user = await GetOrCreateUserAsync(payload, ct);
        var accessToken = GenerateAccessToken(user);
        var refreshToken = await CreateRefreshTokenAsync(user.Id, ct);

        return (user, accessToken, refreshToken);
    }

    public async Task<(User user, string accessToken, string refreshToken)?> LoginWithAppleAsync(
        string identityToken,
        string? fullName,
        string? email,
        CancellationToken ct)
    {
        var (appleSubject, appleEmail) = ValidateAppleToken(identityToken);
        if (appleSubject == null) return null;

        var resolvedEmail = email ?? appleEmail;
        var user = await GetOrCreateAppleUserAsync(appleSubject, resolvedEmail, fullName, ct);

        var accessToken = GenerateAccessToken(user);
        var refreshToken = await CreateRefreshTokenAsync(user.Id, ct);

        return (user, accessToken, refreshToken);
    }

    public async Task<(User user, string accessToken, string refreshToken)?> RefreshTokenAsync(
        string refreshToken,
        CancellationToken ct)
    {
        var token = await _db.UserRefreshTokens
            .Include(x => x.User)
            .FirstOrDefaultAsync(x => x.Token == refreshToken && x.ExpiresAt > DateTimeOffset.UtcNow, ct);

        if (token == null)
            return null;

        // Rotate refresh token — catch race condition if token already consumed by concurrent request
        try
        {
            _db.UserRefreshTokens.Remove(token);
            var newRefreshToken = await CreateRefreshTokenAsync(token.UserId, ct);
            var accessToken = GenerateAccessToken(token.User);
            return (token.User, accessToken, newRefreshToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return null;
        }
    }

    public async Task<bool> LogoutAsync(string refreshToken, CancellationToken ct)
    {
        var token = await _db.UserRefreshTokens
            .FirstOrDefaultAsync(x => x.Token == refreshToken, ct);

        if (token == null)
            return false;

        _db.UserRefreshTokens.Remove(token);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<User?> GetUserByIdAsync(Guid userId, CancellationToken ct)
    {
        return await _db.Users.FirstOrDefaultAsync(x => x.Id == userId, ct);
    }

    public async Task<(User user, string accessToken, string refreshToken)?> RegisterWithEmailAsync(
        string email, string password, string? name, CancellationToken ct)
    {
        email = email.Trim().ToLowerInvariant();

        if (!System.Net.Mail.MailAddress.TryCreate(email, out _))
            return null;

        if (password.Length < 8 || password.Length > 128)
            return null;

        var exists = await _db.Users.AnyAsync(x => x.Email == email, ct);
        if (exists)
            return null;

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Name = name?.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            CreatedAt = DateTimeOffset.UtcNow
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        var accessToken = GenerateAccessToken(user);
        var refreshToken = await CreateRefreshTokenAsync(user.Id, ct);
        return (user, accessToken, refreshToken);
    }

    public async Task<(User user, string accessToken, string refreshToken)?> LoginWithEmailAsync(
        string email, string password, CancellationToken ct)
    {
        email = email.Trim().ToLowerInvariant();

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Email == email, ct);
        if (user == null || user.PasswordHash == null)
            return null;

        if (!BCrypt.Net.BCrypt.Verify(password, user.PasswordHash))
            return null;

        var accessToken = GenerateAccessToken(user);
        var refreshToken = await CreateRefreshTokenAsync(user.Id, ct);
        return (user, accessToken, refreshToken);
    }

    public async Task<bool> EmailExistsAsync(string email, CancellationToken ct)
    {
        return await _db.Users.AnyAsync(x => x.Email == email.Trim().ToLowerInvariant(), ct);
    }

    public async Task<string?> RequestPasswordResetAsync(string email, CancellationToken ct)
    {
        email = email.Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Email == email && x.PasswordHash != null, ct);
        if (user == null)
            return null; // Don't reveal if email exists

        var rawToken = GenerateSecureToken();
        var tokenHash = HashToken(rawToken);

        var resetToken = new PasswordResetToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = tokenHash,
            ExpiresAt = DateTimeOffset.UtcNow.AddHours(1),
            CreatedAt = DateTimeOffset.UtcNow,
            Used = false
        };

        _db.PasswordResetTokens.Add(resetToken);
        await _db.SaveChangesAsync(ct);

        return rawToken;
    }

    public async Task<bool> ResetPasswordAsync(string token, string newPassword, CancellationToken ct)
    {
        if (newPassword.Length < 8 || newPassword.Length > 128)
            return false;

        var tokenHash = HashToken(token);
        var resetToken = await _db.PasswordResetTokens
            .Include(x => x.User)
            .FirstOrDefaultAsync(x => x.TokenHash == tokenHash && !x.Used && x.ExpiresAt > DateTimeOffset.UtcNow, ct);

        if (resetToken == null)
            return false;

        resetToken.Used = true;
        resetToken.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);

        // Invalidate all refresh tokens for this user
        var refreshTokens = await _db.UserRefreshTokens
            .Where(x => x.UserId == resetToken.UserId)
            .ToListAsync(ct);
        _db.UserRefreshTokens.RemoveRange(refreshTokens);

        await _db.SaveChangesAsync(ct);
        return true;
    }

    private static string HashToken(string token)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexStringLower(bytes);
    }

    public Guid? ValidateAccessToken(string accessToken)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var key = Encoding.UTF8.GetBytes(_jwtSettings.SecretKey);

        try
        {
            var principal = tokenHandler.ValidateToken(accessToken, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(key),
                ValidateIssuer = true,
                ValidIssuer = _jwtSettings.Issuer,
                ValidateAudience = false,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.Zero
            }, out _);

            var userIdClaim = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return userIdClaim != null ? Guid.Parse(userIdClaim) : null;
        }
        catch
        {
            return null;
        }
    }

    private async Task<User> GetOrCreateUserAsync(GoogleJsonWebSignature.Payload payload, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(x => x.GoogleSubject == payload.Subject, ct);

        if (user != null)
        {
            // Update name/email/picture if changed
            if (user.Email != payload.Email || user.Name != payload.Name || user.Picture != payload.Picture)
            {
                user.Email = payload.Email;
                user.Name = payload.Name;
                user.Picture = payload.Picture;
                await _db.SaveChangesAsync(ct);
            }
            return user;
        }

        user = new User
        {
            Id = Guid.NewGuid(),
            Email = payload.Email,
            Name = payload.Name,
            Picture = payload.Picture,
            GoogleSubject = payload.Subject,
            CreatedAt = DateTimeOffset.UtcNow
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);
        return user;
    }

    private string GenerateAccessToken(User user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.SecretKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Name, user.Name ?? user.Email)
        };

        var token = new JwtSecurityToken(
            issuer: _jwtSettings.Issuer,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_jwtSettings.AccessTokenExpiryMinutes),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private async Task<string> CreateRefreshTokenAsync(Guid userId, CancellationToken ct)
    {
        var token = new UserRefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Token = GenerateSecureToken(),
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(_jwtSettings.RefreshTokenExpiryDays),
            CreatedAt = DateTimeOffset.UtcNow
        };

        _db.UserRefreshTokens.Add(token);
        await _db.SaveChangesAsync(ct);
        return token.Token;
    }

    private static string GenerateSecureToken()
    {
        var bytes = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Convert.ToBase64String(bytes);
    }

    private (string? subject, string? email) ValidateAppleToken(string identityToken)
    {
        try
        {
            var handler = new JwtSecurityTokenHandler();
            var jwt = handler.ReadJwtToken(identityToken);

            var audience = _appleSettings?.BundleId;
            if (audience != null && jwt.Audiences.All(a => a != audience))
                return (null, null);

            if (jwt.Issuer != "https://appleid.apple.com")
                return (null, null);

            if (jwt.ValidTo < DateTime.UtcNow)
                return (null, null);

            var subject = jwt.Subject;
            var email = jwt.Claims.FirstOrDefault(c => c.Type == "email")?.Value;

            return (subject, email);
        }
        catch
        {
            return (null, null);
        }
    }

    private async Task<User> GetOrCreateAppleUserAsync(
        string appleSubject, string? email, string? fullName, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(x => x.AppleSubject == appleSubject, ct);

        if (user != null)
        {
            if (fullName != null && user.Name != fullName)
            {
                user.Name = fullName;
                await _db.SaveChangesAsync(ct);
            }
            return user;
        }

        var resolvedEmail = email ?? $"{appleSubject}@privaterelay.appleid.com";

        user = new User
        {
            Id = Guid.NewGuid(),
            Email = resolvedEmail,
            Name = fullName,
            GoogleSubject = null,
            AppleSubject = appleSubject,
            CreatedAt = DateTimeOffset.UtcNow
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);
        return user;
    }
}
