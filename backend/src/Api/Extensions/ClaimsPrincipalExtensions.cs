using Application.Auth;

namespace Api.Extensions;

public static class ClaimsPrincipalExtensions
{
    /// <summary>Cookie the web client stores the access token in. Single definition on purpose.</summary>
    public const string AccessTokenCookieName = "access_token";

    private const string BearerPrefix = "Bearer ";

    /// <summary>
    /// The raw access token for this request: <c>Authorization: Bearer …</c> first, then the
    /// <c>access_token</c> cookie. Null when neither carries one.
    /// </summary>
    /// <remarks>
    /// This exists because the parse used to be written twice — <see cref="GetUserId"/> matched the
    /// scheme case-insensitively while <c>AuthEndpoints.GetGuestUserId</c> did a global
    /// <c>.Replace("Bearer ", "")</c>. A client sending lowercase <c>bearer</c> therefore
    /// authenticated but had its guest data silently NOT merged, and the <c>.Replace</c> would also
    /// cut the literal <c>"Bearer "</c> out of the middle of a token. One reader, so the two cannot
    /// disagree again.
    ///
    /// A malformed or non-Bearer <c>Authorization</c> header falls through to the cookie, matching
    /// the behaviour this replaced.
    /// </remarks>
    public static string? GetAccessToken(this HttpContext httpContext)
    {
        var authHeader = httpContext.Request.Headers.Authorization.FirstOrDefault();
        if (!string.IsNullOrEmpty(authHeader) &&
            authHeader.StartsWith(BearerPrefix, StringComparison.OrdinalIgnoreCase))
        {
            var token = authHeader[BearerPrefix.Length..].Trim();
            if (!string.IsNullOrEmpty(token))
                return token;
        }

        var cookieToken = httpContext.Request.Cookies[AccessTokenCookieName];
        return string.IsNullOrEmpty(cookieToken) ? null : cookieToken;
    }

    public static Guid? GetUserId(this HttpContext httpContext, AuthService authService)
    {
        var token = httpContext.GetAccessToken();
        return token == null ? null : authService.ValidateAccessToken(token);
    }
}
