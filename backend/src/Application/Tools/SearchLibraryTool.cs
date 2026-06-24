using System.Text.Json;
using Application.Common.Interfaces;
using Application.Search;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;

namespace Application.Tools;

/// <summary>
/// Librarian agent tool (AI-Agent-3): KEYWORD search over the TextStack catalog. Wraps the existing FTS
/// provider via <see cref="LibrarySearchService"/> and returns up to a few distinct editions enriched with the
/// metadata the agent post-filters on (authors, genres, language, word count → approx pages). Use for concrete
/// title / author / topic words ("Orwell", "surveillance"); for "books LIKE X" or conceptual queries the agent
/// should prefer <see cref="SearchLibrarySemanticTool"/>. Every result carries <c>source:"library"</c> +
/// <c>editionId</c>/<c>slug</c> so a recommendation can only ever name a book that was actually retrieved.
/// </summary>
public sealed class SearchLibraryTool : ITool
{
    private static readonly JsonElement Schema = ToolJson.Schema("""
        {
          "type": "object",
          "properties": {
            "query": { "type": "string", "minLength": 2, "maxLength": 300, "description": "Keywords: a title, author, topic or phrase to search the catalog for." },
            "language": { "type": "string", "maxLength": 8, "description": "Optional language code (e.g. 'en') to narrow results." },
            "limit": { "type": "integer", "minimum": 1, "maximum": 12, "description": "Max results to return (default 8)." }
          },
          "required": ["query"],
          "additionalProperties": false
        }
        """);

    public string Name => "search_library";

    public string Description =>
        "Keyword-search the TextStack book catalog by title, author or topic. Returns matching editions with " +
        "their authors, genres, language and length (word count / approx pages) for filtering. Use this for " +
        "concrete words; use search_library_semantic for 'books like X' or conceptual queries.";

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

        var books = await service.SearchAsync(query, siteId.Value, language, limit, ct);
        return LibraryToolShared.Shape(books, query);
    }
}
