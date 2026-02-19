using Application.Auth;

namespace Api.Extensions;

public static class ClaimsPrincipalExtensions
{
    public static Guid? GetUserId(this HttpContext httpContext, AuthService authService)
    {
        var accessToken = httpContext.Request.Cookies["access_token"];
        if (string.IsNullOrEmpty(accessToken)) return null;
        return authService.ValidateAccessToken(accessToken);
    }
}
