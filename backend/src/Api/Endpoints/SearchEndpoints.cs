using Infrastructure.Data;
using Infrastructure.Enums;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class SearchEndpoints
{
    public static void MapSearchEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/search").WithTags("Search");

        group.MapGet("", Search).WithName("Search");
    }

    private static async Task<IResult> Search(
        AppDbContext db,
        [FromQuery] string q,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        [FromQuery] string? language,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
            return Results.BadRequest(new { error = "Query must be at least 2 characters" });

        var take = Math.Min(limit ?? 20, 100);
        var skip = offset ?? 0;

        var query = db.Chapters
            .Where(c => c.Edition.Status == EditionStatus.Published)
            .Where(c => c.SearchVector!.Matches(EF.Functions.PlainToTsQuery("english", q)));

        if (!string.IsNullOrEmpty(language))
            query = query.Where(c => c.Edition.Language == language);

        var total = await query.CountAsync(ct);

        var results = await query
            .OrderByDescending(c => c.SearchVector!.Rank(EF.Functions.PlainToTsQuery("english", q)))
            .Skip(skip)
            .Take(take)
            .Select(c => new
            {
                ChapterId = c.Id,
                ChapterSlug = c.Slug,
                ChapterTitle = c.Title,
                ChapterNumber = c.ChapterNumber,
                Edition = new
                {
                    c.Edition.Id,
                    c.Edition.Slug,
                    c.Edition.Title,
                    c.Edition.Language,
                    c.Edition.AuthorsJson,
                    c.Edition.CoverPath
                }
            })
            .ToListAsync(ct);

        return Results.Ok(new { total, results });
    }
}
