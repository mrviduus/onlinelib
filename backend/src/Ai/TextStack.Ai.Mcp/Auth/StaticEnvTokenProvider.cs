namespace TextStack.Ai.Mcp.Auth;

/// <summary>
/// Interim <see cref="IMcpTokenProvider"/> backed by the static
/// <c>TEXTSTACK_MCP_TOKEN</c> env var (surfaced via <see cref="McpBridgeOptions.McpToken"/>).
///
/// This is the AI-050 swap point: replacing the DI registration of this type with
/// a device-flow provider is a one-line change in <c>Program.cs</c>.
/// </summary>
public sealed class StaticEnvTokenProvider : IMcpTokenProvider
{
    private readonly string? _token;

    public StaticEnvTokenProvider(McpBridgeOptions options)
    {
        // Treat blank as absent so an empty env var doesn't send "Bearer ".
        _token = string.IsNullOrWhiteSpace(options.McpToken) ? null : options.McpToken;
    }

    public string? GetToken() => _token;
}
