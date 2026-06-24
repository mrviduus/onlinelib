using System.Text.Json;
using Application.Common.Interfaces;
using Application.Search;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;

namespace Application.Tools;

/// <summary>
/// Librarian agent tool (AI-Agent-3): SEMANTIC ("books like X" / conceptual) search over the catalog. Wraps the
/// AI-057 hybrid (<see cref="HybridCatalogSearch"/> — FTS blended with editions.embedding cosine via RRF) through
/// <see cref="LibrarySearchService"/>, returning the SAME enriched <see cref="LibraryBook"/> shape as
/// <see cref="SearchLibraryTool"/>. This IS the "similar" mechanism for the MVP — no dedicated book-similarity
/// index. On a keyless/throttled host the hybrid degrades to FTS-only inside the search service, so this tool
/// never throws on that account. Provenance (<c>source:"library"</c> + ids) is carried through identically.
/// </summary>
public sealed class SearchLibrarySemanticTool : ITool
{
    private static readonly JsonElement Schema = ToolJson.Schema("""
        {
          "type": "object",
          "properties": {
            "query": { "type": "string", "minLength": 2, "maxLength": 300, "description": "A concept, theme, or 'like <title>' description to find similar books for." },
            "language": { "type": "string", "maxLength": 8, "description": "Optional language code (e.g. 'en') to narrow results." },
            "limit": { "type": "integer", "minimum": 1, "maximum": 12, "description": "Max results to return (default 8)." }
          },
          "required": ["query"],
          "additionalProperties": false
        }
        """);

    public string Name => "search_library_semantic";

    public string Description =>
        "Semantic catalog search for conceptual or 'books like X' requests (blends keyword + meaning). Returns " +
        "editions with authors, genres, language and length. Prefer this over search_library when the request " +
        "is about a theme/idea or asks for books similar to a given one.";

    public JsonElement ArgsSchema => Schema;

    public async Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct)
    {
        var query = ToolJson.GetString(args, "query")!.Trim(); // shape guaranteed by schema validation
        var language = ToolJson.GetString(args, "language")?.Trim();
        var limit = ToolJson.GetInt(args, "limit") ?? LibraryToolShared.DefaultLimit;

        var db = ctx.Services.GetRequiredService<IAppDbContext>();
        var siteId = await LibraryToolShared.ResolveSiteIdAsync(db, ct);
        if (siteId is null)
            return LibraryToolShared.NoSite(query);

        // API-host-only: LibrarySearchService is wired in the API DI but NOT in the Worker. The Worker's
        // assembly tool-scan still constructs this tool, so resolve defensively (GetService, not GetRequired)
        // and degrade as data rather than NRE if a future Worker agent ever allow-lists it.
        var service = ctx.Services.GetService<LibrarySearchService>();
        if (service is null)
            return LibraryToolShared.Unavailable();

        var books = await service.SearchSemanticAsync(query, siteId.Value, language, limit, ct);
        return LibraryToolShared.Shape(books, query);
    }
}
