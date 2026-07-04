using Api.Extensions;
using Api.Mapping;
using Application.Auth;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;

namespace Api.Endpoints;

public static class AuthEndpoints
{
    private const string AccessTokenCookie = "access_token";
    private const string RefreshTokenCookie = "refresh_token";

    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/auth").WithTags("Auth");

        group.MapPost("/register", Register).WithName("RegisterWithEmail").RequireRateLimiting("user-login");
        group.MapPost("/login", LoginWithEmail).WithName("LoginWithEmail").RequireRateLimiting("user-login");
        group.MapPost("/google", LoginWithGoogle).WithName("LoginWithGoogle");
        group.MapPost("/apple", LoginWithApple).WithName("LoginWithApple");
        group.MapPost("/refresh", RefreshToken).WithName("RefreshToken");
        group.MapPost("/refresh-mobile", RefreshTokenMobile).WithName("RefreshTokenMobile");
        group.MapPost("/logout", Logout).WithName("Logout");
        group.MapPost("/forgot-password", ForgotPassword).WithName("ForgotPassword").RequireRateLimiting("user-login");
        group.MapPost("/reset-password", ResetPassword).WithName("ResetPassword").RequireRateLimiting("user-login");
        group.MapPost("/guest", CreateGuestSession).WithName("CreateGuestSession").RequireRateLimiting("guest-session");
        group.MapGet("/me", GetCurrentUser).WithName("GetCurrentUser");

        if (app.Environment.IsDevelopment()
            || string.Equals(app.Configuration["ENABLE_TEST_AUTH"], "true", StringComparison.OrdinalIgnoreCase))
        {
            group.MapPost("/test-login", TestLogin).WithName("TestLogin");
        }
    }

    private static async Task<IResult> CreateGuestSession(
        AuthService authService,
        HttpContext httpContext,
        CancellationToken ct)
    {
        // If already authenticated, return current user
        var existingUserId = httpContext.GetUserId(authService);
        if (existingUserId.HasValue)
        {
            var existingUser = await authService.GetUserByIdAsync(existingUserId.Value, ct);
            if (existingUser != null)
                return Results.Ok(new AuthResponse(existingUser.ToDto()));
        }

        var result = await authService.CreateGuestSessionAsync(ct);
        return ReturnAuthResult(result, httpContext);
    }

    private static async Task<IResult> TestLogin(
        [FromBody] TestLoginRequest request,
        AuthService authService,
        HttpContext httpContext,
        CancellationToken ct)
    {
        var result = await authService.TestLoginAsync(request.Email, ct);
        return ReturnAuthResult(result, httpContext);
    }

    private static async Task<IResult> Register(
        [FromBody] EmailRegisterRequest request,
        AuthService authService,
        HttpContext httpContext,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return Results.BadRequest(new { error = "Email and password are required." });

        if (request.Password.Length < 8)
            return Results.BadRequest(new { error = "Password must be at least 8 characters." });

        if (request.Password.Length > 128)
            return Results.BadRequest(new { error = "Password must be at most 128 characters." });

        if (await authService.EmailExistsAsync(request.Email, ct))
            return Results.Conflict(new { error = "An account with this email already exists." });

        var guestUserId = GetGuestUserId(httpContext, authService);

        var result = await authService.RegisterWithEmailAsync(request.Email, request.Password, request.Name, guestUserId, ct);
        if (result == null)
            return Results.BadRequest(new { error = "Invalid email or password." });

        return ReturnAuthResult(result.Value, httpContext);
    }

    private static async Task<IResult> LoginWithEmail(
        [FromBody] EmailLoginRequest request,
        AuthService authService,
        HttpContext httpContext,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return Results.Unauthorized();

        var guestUserId = GetGuestUserId(httpContext, authService);

        var result = await authService.LoginWithEmailAsync(request.Email, request.Password, ct);
        if (result == null)
            return Results.Unauthorized();

        // Merge guest data into existing account
        if (guestUserId.HasValue)
            await authService.MergeGuestAsync(guestUserId.Value, result.Value.user.Id, ct);

        return ReturnAuthResult(result.Value, httpContext);
    }

    private static async Task<IResult> LoginWithGoogle(
        [FromBody] GoogleLoginRequest request,
        AuthService authService,
        HttpContext httpContext,
        CancellationToken ct)
    {
        var guestUserId = GetGuestUserId(httpContext, authService);

        var result = await authService.LoginWithGoogleAsync(request.IdToken, ct);
        if (result == null)
            return Results.Unauthorized();

        if (guestUserId.HasValue)
            await authService.MergeGuestAsync(guestUserId.Value, result.Value.user.Id, ct);

        return ReturnAuthResult(result.Value, httpContext);
    }

    private static async Task<IResult> LoginWithApple(
        [FromBody] AppleLoginRequest request,
        AuthService authService,
        HttpContext httpContext,
        CancellationToken ct)
    {
        var guestUserId = GetGuestUserId(httpContext, authService);

        var result = await authService.LoginWithAppleAsync(
            request.IdentityToken, request.FullName, request.Email, ct);
        if (result == null)
            return Results.Unauthorized();

        if (guestUserId.HasValue)
            await authService.MergeGuestAsync(guestUserId.Value, result.Value.user.Id, ct);

        return ReturnAuthResult(result.Value, httpContext);
    }

    private static async Task<IResult> RefreshToken(
        AuthService authService,
        HttpContext httpContext,
        CancellationToken ct)
    {
        var refreshToken = httpContext.Request.Cookies[RefreshTokenCookie];
        if (string.IsNullOrEmpty(refreshToken))
            return Results.Unauthorized();

        var result = await authService.RefreshTokenAsync(refreshToken, ct);
        if (result == null)
        {
            ClearAuthCookies(httpContext);
            return Results.Unauthorized();
        }

        return ReturnAuthResult(result.Value, httpContext);
    }

    private static async Task<IResult> RefreshTokenMobile(
        [FromBody] MobileRefreshRequest request,
        AuthService authService,
        CancellationToken ct)
    {
        var result = await authService.RefreshTokenAsync(request.RefreshToken, ct);
        if (result == null)
            return Results.Unauthorized();

        var (user, newAccessToken, newRefreshToken) = result.Value;
        return Results.Ok(new MobileAuthResponse(user.ToDto(), newAccessToken, newRefreshToken));
    }

    private static async Task<IResult> Logout(
        AuthService authService,
        HttpContext httpContext,
        CancellationToken ct)
    {
        var refreshToken = httpContext.Request.Cookies[RefreshTokenCookie];
        if (!string.IsNullOrEmpty(refreshToken))
            await authService.LogoutAsync(refreshToken, ct);

        ClearAuthCookies(httpContext);
        return Results.Ok();
    }

    private static async Task<IResult> GetCurrentUser(
        AuthService authService,
        HttpContext httpContext,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null)
            return Results.Unauthorized();

        var user = await authService.GetUserByIdAsync(userId.Value, ct);
        if (user == null)
            return Results.Unauthorized();

        return Results.Ok(new AuthResponse(user.ToDto()));
    }

    private static async Task<IResult> ForgotPassword(
        [FromBody] ForgotPasswordRequest request,
        AuthService authService,
        IEmailService emailService,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
            return Results.Ok(); // Don't reveal anything

        var rawToken = await authService.RequestPasswordResetAsync(request.Email, ct);
        if (rawToken != null)
        {
            await emailService.SendPasswordResetEmailAsync(request.Email.Trim(), rawToken, ct);
        }

        return Results.Ok(); // Always 200 to prevent email enumeration
    }

    private static async Task<IResult> ResetPassword(
        [FromBody] ResetPasswordRequest request,
        AuthService authService,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.Password))
            return Results.BadRequest(new { error = "Token and password are required." });

        if (request.Password.Length < 8)
            return Results.BadRequest(new { error = "Password must be at least 8 characters." });

        var success = await authService.ResetPasswordAsync(request.Token, request.Password, ct);
        if (!success)
            return Results.BadRequest(new { error = "Invalid or expired reset link." });

        return Results.Ok();
    }

    private static IResult ReturnAuthResult(
        (User user, string accessToken, string refreshToken) result,
        HttpContext httpContext)
    {
        var (user, accessToken, refreshToken) = result;
        var dto = user.ToDto();

        if (IsMobileClient(httpContext))
            return Results.Ok(new MobileAuthResponse(dto, accessToken, refreshToken));

        SetAuthCookies(httpContext, accessToken, refreshToken);
        return Results.Ok(new AuthResponse(dto));
    }

    private static void SetAuthCookies(HttpContext httpContext, string accessToken, string refreshToken)
    {
        var isProduction = !httpContext.RequestServices
            .GetRequiredService<IWebHostEnvironment>()
            .IsDevelopment();

        var options = new CookieOptions
        {
            HttpOnly = true,
            Secure = isProduction,
            SameSite = SameSiteMode.Lax,
            MaxAge = TimeSpan.FromDays(30),
            Path = "/"
        };

        httpContext.Response.Cookies.Append(AccessTokenCookie, accessToken, options);
        httpContext.Response.Cookies.Append(RefreshTokenCookie, refreshToken, options);
    }

    private static void ClearAuthCookies(HttpContext httpContext)
    {
        httpContext.Response.Cookies.Delete(AccessTokenCookie);
        httpContext.Response.Cookies.Delete(RefreshTokenCookie);
    }

    private static bool IsMobileClient(HttpContext httpContext)
    {
        return httpContext.Request.Headers["X-Client"].FirstOrDefault()
            ?.Equals("mobile", StringComparison.OrdinalIgnoreCase) == true;
    }

    /// <summary>Extract guest userId from current JWT cookies (if it's a guest session).</summary>
    private static Guid? GetGuestUserId(HttpContext httpContext, AuthService authService)
    {
        var userId = httpContext.GetUserId(authService);
        if (!userId.HasValue) return null;

        // Check the is_guest claim in the JWT
        var accessToken = httpContext.Request.Headers["Authorization"].FirstOrDefault()?.Replace("Bearer ", "")
            ?? httpContext.Request.Cookies[AccessTokenCookie];
        if (accessToken == null) return null;

        var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
        try
        {
            var jwt = handler.ReadJwtToken(accessToken);
            var isGuest = jwt.Claims.FirstOrDefault(c => c.Type == "is_guest")?.Value;
            return isGuest == "true" ? userId : null;
        }
        catch
        {
            return null;
        }
    }
}
