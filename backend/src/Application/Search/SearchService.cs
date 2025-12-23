using Application.Common.Interfaces;
using Contracts.Common;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Search;

public record SearchResultDto(
    Guid ChapterId,
    string? ChapterSlug,
    string? ChapterTitle,
    int ChapterNumber,
    SearchEditionDto Edition
);

public record SearchEditionDto(
    Guid Id,
    string Slug,
    string Title,
    string Language,
    string? AuthorsJson,
    string? CoverPath
);

public class SearchService(IAppDbContext db)
{
    public async Task<PaginatedResult<SearchResultDto>> SearchAsync(
        Guid siteId, string query, int offset, int limit, string language, CancellationToken ct)
    {
        // Use language-specific FTS config
        var ftsConfig = GetFtsConfig(language);
        var tsQuery = EF.Functions.PlainToTsQuery(ftsConfig, query);

        var baseQuery = db.Chapters
            .Where(c => c.Edition.SiteId == siteId && c.Edition.Status == EditionStatus.Published)
            .Where(c => c.Edition.Language == language)
            .Where(c => c.SearchVector.Matches(tsQuery));

        var total = await baseQuery.CountAsync(ct);

        var results = await baseQuery
            .OrderByDescending(c => c.SearchVector.Rank(tsQuery))
            .Skip(offset)
            .Take(limit)
            .Select(c => new SearchResultDto(
                c.Id,
                c.Slug,
                c.Title,
                c.ChapterNumber,
                new SearchEditionDto(
                    c.Edition.Id,
                    c.Edition.Slug,
                    c.Edition.Title,
                    c.Edition.Language,
                    c.Edition.AuthorsJson,
                    c.Edition.CoverPath
                )
            ))
            .ToListAsync(ct);

        return new PaginatedResult<SearchResultDto>(total, results);
    }

    private static string GetFtsConfig(string language) => language switch
    {
        "en" => "english",
        "uk" => "simple",  // Ukrainian uses simple config (no stemming in default PostgreSQL)
        _ => "simple"
    };
}
