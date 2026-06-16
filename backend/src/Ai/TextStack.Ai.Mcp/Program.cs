using Microsoft.Extensions.Hosting;
using TextStack.Ai.Mcp;

// ════════════════════════════════════════════════════════════════════════════
// TextStack MCP server — dual transport (AI-047 stdio + AI-049 remote HTTP).
//
// Transport is selected by env MCP_TRANSPORT (stdio | http; default stdio) or the
// --http CLI flag. The two hosts live in McpHosts; the shared wiring (tool catalog
// handlers, typed API client) lives in McpBridgeCore.
//
// STDIO MODE (default — byte-identical to the pre-049 server):
//   stdout carries ONLY MCP JSON-RPC framing. A single stray byte corrupts the
//   stream, so ALL logging goes to stderr and we NEVER call Console.Write* in the
//   stdio path. Singleton DI; device-flow / static-env token (one process identity).
//
// HTTP MODE (AI-049 — remote, multi-user):
//   Streamable HTTP behind nginx + the Cloudflare tunnel. NOT one identity: each
//   connection authenticates with its OWN Authorization: Bearer header (scoped
//   HttpContextTokenProvider) — the device-flow cache is never used here. Normal
//   logging is fine (no JSON-RPC on stdout). Exposes /mcp and a /health probe.
//
// Either way this process is a thin, stateless MCP↔HTTP adapter: every tool call
// becomes an HTTP request to the existing TextStack API. No DB, no EF, no OpenAI.
// ════════════════════════════════════════════════════════════════════════════

var options = McpBridgeOptions.FromEnvironment(args);

if (options.Transport == McpTransport.Http)
{
    var app = McpHosts.BuildHttp(options, args);
    await app.RunAsync();
}
else
{
    var host = McpHosts.BuildStdio(options, args);
    await host.RunAsync();
}
