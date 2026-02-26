using Application.Auth;

namespace Api.Extensions;

public static class ClaimsPrincipalExtensions
{
    public static Guid? GetUserId(this HttpContext httpContext, AuthService authService)
    {
        var authHeader = httpContext.Request.Headers.Authorization.FirstOrDefault();
        if (!string.IsNullOrEmpty(authHeader) &&
            authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var token = authHeader["Bearer ".Length..].Trim();
            if (!string.IsNullOrEmpty(token))
                return authService.ValidateAccessToken(token);
        }

        var accessToken = httpContext.Request.Cookies["access_token"];
        if (string.IsNullOrEmpty(accessToken)) return null;
        return authService.ValidateAccessToken(accessToken);
    }
}
