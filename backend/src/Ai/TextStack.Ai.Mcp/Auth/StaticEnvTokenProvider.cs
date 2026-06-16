namespace TextStack.Ai.Mcp.Auth;

/// <summary>
/// <see cref="IMcpTokenProvider"/> backed by the static <c>TEXTSTACK_MCP_TOKEN</c>
/// env var (surfaced via <see cref="McpBridgeOptions.McpToken"/>).
///
/// This is the CI / escape-hatch provider: when the env var is set the bridge
/// uses it instead of the device flow (one branch in <c>Program.cs</c>). A blank
/// token is treated as absent and yields <see cref="TokenResult.Failed"/>.
/// </summary>
public sealed class StaticEnvTokenProvider : IMcpTokenProvider
{
    private readonly string? _token;

    public StaticEnvTokenProvider(McpBridgeOptions options)
    {
        // Treat blank as absent so an empty env var doesn't send "Bearer ".
        _token = string.IsNullOrWhiteSpace(options.McpToken) ? null : options.McpToken;
    }

    public Task<TokenResult> GetTokenAsync(CancellationToken ct) =>
        Task.FromResult<TokenResult>(_token is null
            ? new TokenResult.Failed("no TEXTSTACK_MCP_TOKEN configured")
            : new TokenResult.Authorized(_token));
}
