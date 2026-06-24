using System.Text.Json;
using Application.Common.Interfaces;
using Application.Search;
using Microsoft.EntityFrameworkCore;

namespace Application.Tools;

/// <summary>
/// Shared shaping + site resolution for the Librarian library-search tools (AI-Agent-3,
/// <c>search_library</c> / <c>search_library_semantic</c>). Both tools run the same enriched
/// <see cref="LibrarySearchService"/> seam and return the SAME result shape; the only difference is FTS vs the
/// AI-057 hybrid. Every returned book carries <c>source:"library"</c> and its real <c>editionId</c>/<c>slug</c>
/// so the agent can only recommend titles it actually retrieved (anti-hallucination provenance), and all
/// free-text (titles/authors/genres) is run through <see cref="ExternalTextSanitizer"/> — defence-in-depth even
/// for our own catalog, mirroring the enrichment agent's treatment of its own excerpts.
/// </summary>
public static class LibraryToolShared
{
    public const int DefaultLimit = 8;

    /// <summary>The catalog is single-site (ADR-007); resolve the one site so the FTS query can scope to it.</summary>
    public static async Task<Guid?> ResolveSiteIdAsync(IAppDbContext db, CancellationToken ct)
    {
        var site = await db.Sites.AsNoTracking().FirstOrDefaultAsync(ct);
        return site?.Id;
    }

    /// <summary>Projects the enriched hits to the agent-facing JSON (sanitized free-text, length signals, provenance).</summary>
    public static JsonElement Shape(IReadOnlyList<LibraryBook> books, string query)
    {
        if (books.Count == 0)
            return ToolJson.Result(new { found = false, query, results = Array.Empty<object>() });

        var results = books.Select(b => new
        {
            source = "library",
            editionId = b.EditionId,
            slug = b.Slug,
            title = ExternalTextSanitizer.Clean(b.Title) ?? b.Title,
            authors = b.Authors.Select(a => ExternalTextSanitizer.Clean(a) ?? a).ToList(),
            genres = b.Genres.Select(g => ExternalTextSanitizer.Clean(g) ?? g).ToList(),
            language = b.Language,
            wordCount = b.WordCount,
            approxPages = b.ApproxPages,
            year = b.Year,
        });

        return ToolJson.Result(new { found = true, query, results });
    }

    /// <summary>Empty-but-successful result (no DB site → degrade as data, never throw — the agent recovers).</summary>
    public static JsonElement NoSite(string query) =>
        ToolJson.Result(new { found = false, query, results = Array.Empty<object>(), message = "Catalog unavailable." });
}
