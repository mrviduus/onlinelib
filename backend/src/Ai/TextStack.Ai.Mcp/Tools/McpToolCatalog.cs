using System.Text.Json;
using ModelContextProtocol.Protocol;
using TextStack.Ai.Mcp.Http;

namespace TextStack.Ai.Mcp.Tools;

/// <summary>
/// The runtime catalog of MCP tools the server exposes. AI-047 ships exactly one
/// entry — <c>search_books</c> — bridged to <c>GET /search</c>. AI-048+ append
/// descriptors here; <c>tools/list</c> and <c>tools/call</c> are served from this
/// list, so adding a tool is a single append + its handler.
/// </summary>
public sealed class McpToolCatalog
{
    private readonly IReadOnlyDictionary<string, McpToolDescriptor> _byName;

    public McpToolCatalog(TextStackApiClient api)
    {
        var tools = new[] { BuildSearchBooks(api) };
        _byName = tools.ToDictionary(t => t.Name, StringComparer.Ordinal);
    }

    public List<Tool> ListTools() =>
        _byName.Values.Select(d => d.ToProtocolTool()).ToList();

    /// <summary>
    /// Dispatches a <c>tools/call</c>. Unknown tool → an <c>IsError</c> result
    /// (per MCP convention, tool-level failures are returned, not thrown).
    /// </summary>
    public Task<CallToolResult> CallAsync(string name, JsonElement? arguments, CancellationToken ct)
    {
        if (!_byName.TryGetValue(name, out var descriptor))
            return Task.FromResult(Error($"Unknown tool '{name}'."));

        return descriptor.Handler(arguments, ct);
    }

    // ── search_books ──────────────────────────────────────────────────────────

    private static readonly JsonElement SearchBooksSchema = JsonDocument.Parse(
        """
        {
          "type": "object",
          "properties": {
            "query": { "type": "string", "minLength": 2, "maxLength": 200 },
            "limit": { "type": "integer", "minimum": 1, "maximum": 50 }
          },
          "required": ["query"],
          "additionalProperties": false
        }
        """).RootElement;

    private static McpToolDescriptor BuildSearchBooks(TextStackApiClient api) => new()
    {
        Name = "search_books",
        Description = "Search the TextStack library for books and chapters matching a query.",
        InputSchema = SearchBooksSchema,
        Handler = async (args, ct) =>
        {
            // Minimal guard: the low-level handler path does not validate against
            // InputSchema, so enforce the same constraints the schema declares.
            if (!TryReadArgs(args, out var query, out var limit, out var validationError))
                return Error(validationError);

            PaginatedResult<SearchResultDto> page;
            try
            {
                page = await api.SearchBooksAsync(query, limit, ct);
            }
            // Real client cancellation (client disconnected) is cooperative — let it
            // propagate so the SDK ends the call. Only a TIMEOUT (HttpClient's own
            // timeout also surfaces as OperationCanceledException, but with the
            // caller's token NOT cancelled) becomes a clean tool error.
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                return Error("search_books failed: upstream timed out");
            }
            // Transport (DNS/connection) or parse (non-JSON 200 body) failure →
            // clean MCP tool error, not a JSON-RPC protocol fault. Do NOT leak
            // stack traces, inner URLs, or exception text to the model.
            catch (Exception ex) when (ex is HttpRequestException or JsonException)
            {
                return Error("search_books failed: upstream unavailable");
            }

            var results = page.Items.Select(hit => new
            {
                title = hit.Edition.Title,
                author = hit.Edition.Authors ?? "",
                chapterTitle = hit.ChapterTitle ?? "",
                editionSlug = hit.Edition.Slug,
                // First highlight fragment as a compact snippet, if present.
                snippet = hit.Highlights is { Count: > 0 } h ? h[0] : "",
            });

            var json = JsonSerializer.Serialize(new { results });
            return Text(json);
        },
    };

    /// <summary>
    /// Validates + extracts the <c>search_books</c> args (mirrors the input
    /// schema). Returns false with a message on any violation.
    /// </summary>
    private static bool TryReadArgs(
        JsonElement? args,
        out string query,
        out int? limit,
        out string error)
    {
        query = "";
        limit = null;
        error = "";

        if (args is not { ValueKind: JsonValueKind.Object } obj)
        {
            error = "Arguments must be an object with a 'query' string.";
            return false;
        }

        // additionalProperties: false
        foreach (var prop in obj.EnumerateObject())
        {
            if (prop.Name is not ("query" or "limit"))
            {
                error = $"Unknown argument '{prop.Name}'.";
                return false;
            }
        }

        if (!obj.TryGetProperty("query", out var q) || q.ValueKind != JsonValueKind.String)
        {
            error = "'query' is required and must be a string.";
            return false;
        }

        var queryValue = q.GetString() ?? "";
        if (queryValue.Length is < 2 or > 200)
        {
            error = "'query' must be between 2 and 200 characters.";
            return false;
        }

        if (obj.TryGetProperty("limit", out var l))
        {
            if (l.ValueKind != JsonValueKind.Number || !l.TryGetInt32(out var limitValue))
            {
                error = "'limit' must be an integer.";
                return false;
            }

            if (limitValue is < 1 or > 50)
            {
                error = "'limit' must be between 1 and 50.";
                return false;
            }

            limit = limitValue;
        }

        query = queryValue;
        return true;
    }

    // ── MCP result helpers ──────────────────────────────────────────────────────

    private static CallToolResult Text(string text) => new()
    {
        Content = [new TextContentBlock { Text = text }],
    };

    private static CallToolResult Error(string message) => new()
    {
        IsError = true,
        Content = [new TextContentBlock { Text = message }],
    };
}
