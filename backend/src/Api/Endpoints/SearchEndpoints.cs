using Api.Language;
using Api.Sites;
using Application.Search;
using Microsoft.AspNetCore.Mvc;

namespace Api.Endpoints;

public static class SearchEndpoints
{
    public static void MapSearchEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/search").WithTags("Search");

        group.MapGet("", Search).WithName("Search");
    }

    private static async Task<IResult> Search(
        HttpContext httpContext,
        SearchService searchService,
        [FromQuery] string q,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
            return Results.BadRequest(new { error = "Query must be at least 2 characters" });

        var siteId = httpContext.GetSiteId();
        var language = httpContext.GetLanguage();
        var take = Math.Min(limit ?? 20, 100);
        var skip = offset ?? 0;

        var result = await searchService.SearchAsync(siteId, q, skip, take, language, ct);
        return Results.Ok(result);
    }
}
