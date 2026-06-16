namespace TextStack.Ai.Mcp;

/// <summary>
/// Environment-driven config for the stateless MCP↔HTTP bridge.
/// </summary>
public sealed class McpBridgeOptions
{
    /// <summary>Base URL of the TextStack public API. Env: <c>TEXTSTACK_API_URL</c>.</summary>
    public required string ApiBaseUrl { get; init; }

    /// <summary>
    /// Host header sent on each bridged request so <c>SiteContextMiddleware</c>
    /// can resolve the site for unauthenticated <c>/search</c>. Env:
    /// <c>TEXTSTACK_SITE_HOST</c>.
    /// </summary>
    public required string SiteHost { get; init; }

    /// <summary>
    /// Bearer token for the user-scoped tools (AI-048a serves it via
    /// <see cref="Auth.StaticEnvTokenProvider"/>). AI-050 replaces the provider
    /// with a device-flow source; this env var stays the interim contract.
    /// Env: <c>TEXTSTACK_MCP_TOKEN</c>.
    /// </summary>
    public string? McpToken { get; init; }

    public static McpBridgeOptions FromEnvironment()
    {
        var apiUrl = Environment.GetEnvironmentVariable("TEXTSTACK_API_URL");
        if (string.IsNullOrWhiteSpace(apiUrl))
            apiUrl = "https://textstack.app/api";

        var siteHost = Environment.GetEnvironmentVariable("TEXTSTACK_SITE_HOST");
        if (string.IsNullOrWhiteSpace(siteHost))
            siteHost = "textstack.app";

        return new McpBridgeOptions
        {
            ApiBaseUrl = apiUrl.TrimEnd('/'),
            SiteHost = siteHost,
            // Reserved for AI-050; read now so the env var contract is stable.
            McpToken = Environment.GetEnvironmentVariable("TEXTSTACK_MCP_TOKEN"),
        };
    }
}
