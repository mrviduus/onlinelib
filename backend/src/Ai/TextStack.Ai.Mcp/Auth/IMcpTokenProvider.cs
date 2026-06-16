namespace TextStack.Ai.Mcp.Auth;

/// <summary>
/// Supplies the Bearer token the bridge attaches to user-scoped tool calls
/// (<c>list_my_highlights</c>, <c>list_my_vocabulary</c>, <c>ask_book</c>).
///
/// AI-048a ships <see cref="StaticEnvTokenProvider"/> (reads the reserved
/// <c>TEXTSTACK_MCP_TOKEN</c> env var). AI-050 swaps the single DI registration
/// for a device-flow provider — no tool / client / catalog signature changes.
///
/// A <c>null</c> return means "no token available": the handler returns a clean
/// <c>IsError</c> ("authentication required") and never issues the HTTP call.
/// </summary>
public interface IMcpTokenProvider
{
    string? GetToken();
}
