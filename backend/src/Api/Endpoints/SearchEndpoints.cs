using Api.Language;
using Api.Sites;
using Contracts.Common;
using Microsoft.AspNetCore.Mvc;
using OnlineLib.Search.Abstractions;
using OnlineLib.Search.Analyzers;
using OnlineLib.Search.Contracts;

namespace Api.Endpoints;

public static class SearchEndpoints
{
    public static void MapSearchEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/search").WithTags("Search");

        group.MapGet("", Search).WithName("Search");
        group.MapGet("/suggest", Suggest).WithName("SearchSuggest");
    }

    private static async Task<IResult> Search(
        HttpContext httpContext,
        ISearchProvider searchProvider,
        [FromQuery] string q,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        [FromQuery] bool? highlight,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
            return Results.BadRequest(new { error = "Query must be at least 2 characters" });

        var siteId = httpContext.GetSiteId();
        var language = httpContext.GetLanguage();
        var take = Math.Min(limit ?? 20, 100);
        var skip = offset ?? 0;

        var searchLanguage = MultilingualAnalyzer.DetectFromCode(language);
        var request = new SearchRequest(
            q,
            siteId,
            searchLanguage,
            skip,
            take,
            highlight ?? false);

        var result = await searchProvider.SearchAsync(request, ct);

        // Map to legacy response format for backward compatibility
        var items = result.Hits.Select(MapToSearchResultDto).ToList();
        return Results.Ok(new PaginatedResult<SearchResultDto>(result.TotalCount, items));
    }

    private static async Task<IResult> Suggest(
        HttpContext httpContext,
        ISearchProvider searchProvider,
        [FromQuery] string q,
        [FromQuery] int? limit,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
            return Results.Ok(Array.Empty<SuggestionDto>());

        var siteId = httpContext.GetSiteId();
        var take = Math.Min(limit ?? 10, 20);

        var suggestions = await searchProvider.SuggestAsync(q, siteId, take, ct);

        var items = suggestions.Select(s => new SuggestionDto(s.Text, s.Slug, s.AuthorsJson, s.CoverPath, s.Score)).ToList();
        return Results.Ok(items);
    }

    private static SearchResultDto MapToSearchResultDto(SearchHit hit)
    {
        var meta = hit.Metadata;

        return new SearchResultDto(
            GetGuid(meta, "chapterId"),
            GetString(meta, "chapterSlug"),
            GetString(meta, "chapterTitle"),
            GetInt(meta, "chapterNumber"),
            new SearchEditionDto(
                GetGuid(meta, "editionId"),
                GetString(meta, "editionSlug"),
                GetString(meta, "editionTitle"),
                GetString(meta, "language"),
                GetString(meta, "authorsJson"),
                GetString(meta, "coverPath")
            ),
            hit.Highlights.SelectMany(h => h.Fragments).ToList()
        );
    }

    private static Guid GetGuid(IReadOnlyDictionary<string, object> meta, string key) =>
        meta.TryGetValue(key, out var value) && value is Guid g ? g : Guid.Empty;

    private static string GetString(IReadOnlyDictionary<string, object> meta, string key) =>
        meta.TryGetValue(key, out var value) ? value?.ToString() ?? "" : "";

    private static int GetInt(IReadOnlyDictionary<string, object> meta, string key) =>
        meta.TryGetValue(key, out var value) && value is int i ? i : 0;
}

// Response DTOs for backward compatibility
public record SearchResultDto(
    Guid ChapterId,
    string? ChapterSlug,
    string? ChapterTitle,
    int ChapterNumber,
    SearchEditionDto Edition,
    IReadOnlyList<string>? Highlights = null
);

public record SearchEditionDto(
    Guid Id,
    string Slug,
    string Title,
    string Language,
    string? AuthorsJson,
    string? CoverPath
);

public record SuggestionDto(string Text, string Slug, string? AuthorsJson, string? CoverPath, double Score);
