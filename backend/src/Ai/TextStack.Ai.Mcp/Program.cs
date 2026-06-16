using System.Reflection;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using TextStack.Ai.Mcp;
using TextStack.Ai.Mcp.Http;
using TextStack.Ai.Mcp.Tools;

// ════════════════════════════════════════════════════════════════════════════
// TextStack MCP server — stdio transport, HTTP bridge (AI-047).
//
// INVARIANT: stdout carries ONLY MCP JSON-RPC framing. A single stray byte on
// stdout corrupts the protocol stream. Therefore:
//   • ALL logging goes to stderr (configured below).
//   • NEVER call Console.WriteLine / Console.Write anywhere in this project.
//
// This process is a thin, stateless MCP↔HTTP adapter: every tool call becomes
// an HTTP request to the existing public TextStack API. No DB, no EF, no OpenAI,
// no reference to Application/Infrastructure.
// ════════════════════════════════════════════════════════════════════════════

var builder = Host.CreateApplicationBuilder(args);

// stdout is reserved for JSON-RPC — route every log record to stderr.
builder.Logging.ClearProviders();
builder.Logging.AddConsole(options => options.LogToStandardErrorThreshold = LogLevel.Trace);

var bridgeOptions = McpBridgeOptions.FromEnvironment();
builder.Services.AddSingleton(bridgeOptions);

// Typed HTTP client over the public API. Host header is set per-request inside
// TextStackApiClient so SiteContextMiddleware resolves the site for /search.
builder.Services.AddHttpClient<TextStackApiClient>(http =>
{
    http.BaseAddress = new Uri(bridgeOptions.ApiBaseUrl, UriKind.Absolute);
    // Bound a stuck upstream: default 100s would hang the tool call that long.
    // Matches the repo's TTS 15s convention; overridable via env. A timeout
    // surfaces as OperationCanceledException with the caller token NOT cancelled,
    // which the catalog handler maps to a clean IsError tool result (AI-047 P2).
    http.Timeout = TimeSpan.FromSeconds(McpTimeoutSeconds());
});

builder.Services.AddSingleton<McpToolCatalog>();

var serverVersion = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "1.0.0";

builder.Services
    .AddMcpServer(options =>
    {
        options.ServerInfo = new Implementation { Name = "textstack", Version = serverVersion };
        // Advertise the tools capability ONLY — no prompts/resources in AI-047.
        options.Capabilities = new ServerCapabilities { Tools = new ToolsCapability() };
        options.Handlers = new McpServerHandlers
        {
            // tools/list — projected from the runtime catalog.
            ListToolsHandler = (request, _) =>
            {
                var catalog = request.Services!.GetRequiredService<McpToolCatalog>();
                return ValueTask.FromResult(new ListToolsResult { Tools = catalog.ListTools() });
            },
            // tools/call — dispatch by name; args dictionary → a single JSON object
            // for the catalog handler (which validates against the input schema).
            CallToolHandler = async (request, ct) =>
            {
                var catalog = request.Services!.GetRequiredService<McpToolCatalog>();
                var name = request.Params!.Name;
                var arguments = ToArgumentsObject(request.Params.Arguments);
                return await catalog.CallAsync(name, arguments, ct);
            },
        };
    })
    .WithStdioServerTransport();

// Generic Host + stdio transport handle stdin EOF / SIGINT for clean shutdown.
await builder.Build().RunAsync();

// Rebuilds the MCP-supplied args dictionary into a single JSON object element so
// the catalog handler can validate/read it as one schema-shaped value.
static JsonElement? ToArgumentsObject(IDictionary<string, JsonElement>? arguments)
{
    if (arguments is null)
        return null;

    var node = new System.Text.Json.Nodes.JsonObject();
    foreach (var (key, value) in arguments)
        node[key] = System.Text.Json.Nodes.JsonNode.Parse(value.GetRawText());

    return JsonSerializer.SerializeToElement(node);
}

// HttpClient timeout in seconds. Env: TEXTSTACK_MCP_TIMEOUT_SECONDS (default 15);
// a non-positive / unparseable value falls back to the 15s default.
static double McpTimeoutSeconds()
{
    var raw = Environment.GetEnvironmentVariable("TEXTSTACK_MCP_TIMEOUT_SECONDS");
    if (double.TryParse(raw, out var seconds) && seconds > 0)
        return seconds;

    return 15;
}
