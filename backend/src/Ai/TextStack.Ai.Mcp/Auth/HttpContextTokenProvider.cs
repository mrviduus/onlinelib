using Microsoft.AspNetCore.Http;

namespace TextStack.Ai.Mcp.Auth;

/// <summary>
/// HTTP-mode <see cref="IMcpTokenProvider"/> (AI-049). The remote transport is
/// MULTI-USER: each connection authenticates with its OWN
/// <c>Authorization: Bearer &lt;token&gt;</c> header, NOT a server-side device-flow
/// cache. This provider reads that header off the CURRENT request and never does
/// device flow / never touches <see cref="TokenCache"/>.
///
/// Registered SCOPED (so the per-request bearer can't leak across connections);
/// resolves the live request via <see cref="IHttpContextAccessor"/>.
///   • non-empty bearer → <see cref="TokenResult.Authorized"/> (the raw JWT).
///   • missing / empty / "Bearer "-only / malformed → <see cref="TokenResult.Failed"/>
///     with an actionable "set Authorization: Bearer &lt;token&gt;" message that the
///     catalog renders as a clean auth-required IsError (the HTTP call is never made).
///
/// NEVER yields <see cref="TokenResult.Pending"/> — there is no device flow in http
/// mode; the user pastes the AI-050 device-flow JWT into their MCP client config.
/// </summary>
public sealed class HttpContextTokenProvider : IMcpTokenProvider
{
    private const string BearerScheme = "Bearer ";

    private static readonly TokenResult.Failed NoBearer = new(
        "authentication required — set Authorization: Bearer <token> in your MCP client");

    private readonly IHttpContextAccessor _accessor;

    public HttpContextTokenProvider(IHttpContextAccessor accessor) => _accessor = accessor;

    public Task<TokenResult> GetTokenAsync(CancellationToken ct)
    {
        // No live request (defensive) → fail-clean, no throw.
        var header = _accessor.HttpContext?.Request.Headers.Authorization.ToString();
        if (string.IsNullOrWhiteSpace(header))
            return Task.FromResult<TokenResult>(NoBearer);

        // Strip the scheme case-insensitively. A header that is NOT a Bearer scheme,
        // or "Bearer " with nothing after it, is treated as missing.
        if (!header.StartsWith(BearerScheme, StringComparison.OrdinalIgnoreCase))
            return Task.FromResult<TokenResult>(NoBearer);

        var token = header[BearerScheme.Length..].Trim();
        return Task.FromResult<TokenResult>(
            token.Length == 0 ? NoBearer : new TokenResult.Authorized(token));
    }
}
