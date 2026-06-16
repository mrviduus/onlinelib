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
    /// Bearer token for the user-scoped tools. When set, the bridge uses
    /// <see cref="Auth.StaticEnvTokenProvider"/> (CI / escape hatch) instead of the
    /// device flow. When unset, the default is
    /// <see cref="Auth.DeviceFlowTokenProvider"/>. Env: <c>TEXTSTACK_MCP_TOKEN</c>.
    /// </summary>
    public string? McpToken { get; init; }

    /// <summary>
    /// Optional explicit path for the device-flow token cache file. When unset,
    /// <see cref="Auth.TokenCache.ResolvePath"/> uses
    /// <c>$XDG_CONFIG_HOME/textstack/mcp-token.json</c> (or
    /// <c>~/.textstack/mcp-token.json</c>). Env: <c>TEXTSTACK_MCP_TOKEN_CACHE</c>.
    /// </summary>
    public string? TokenCachePath { get; init; }

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
            // When set → static-token mode (CI / escape hatch); else device flow.
            McpToken = Environment.GetEnvironmentVariable("TEXTSTACK_MCP_TOKEN"),
            TokenCachePath = Environment.GetEnvironmentVariable("TEXTSTACK_MCP_TOKEN_CACHE"),
        };
    }
}
