using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Application.UserBooks;

public class UserBookSearchService(IAppDbContext db)
{
    public const int MaxResults = 50;

    public async Task<IReadOnlyList<UserBookSearchHit>> SearchAsync(
        Guid userId, string query, IEnumerable<string>? tags, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(query)) return Array.Empty<UserBookSearchHit>();

        var tagsArray = (tags ?? Array.Empty<string>())
            .Select(t => t.Trim().ToLowerInvariant())
            .Where(t => t.Length > 0)
            .Distinct()
            .ToArray();

        // websearch_to_tsquery handles user-typed query strings safely (quoted phrases, OR, -negation).
        // ts_headline returns excerpt with <mark>...</mark> around hits for direct UI rendering.
        var hasTagFilter = tagsArray.Length > 0;
        var sql = $@"
            SELECT
                ub.id AS ""Id"",
                ub.title AS ""Title"",
                ub.author AS ""Author"",
                ub.cover_path AS ""CoverPath"",
                ub.language AS ""Language"",
                MAX(ts_rank(uc.search_vector, q))::float8 AS ""Rank"",
                (array_agg(
                    ts_headline('english', uc.plain_text, q, 'StartSel=<mark>,StopSel=</mark>,MaxFragments=1,MinWords=15,MaxWords=30,ShortWord=2')
                    ORDER BY ts_rank(uc.search_vector, q) DESC
                ))[1] AS ""Excerpt"",
                (array_agg(uc.slug ORDER BY ts_rank(uc.search_vector, q) DESC))[1] AS ""ChapterSlug""
            FROM user_books ub
            JOIN user_chapters uc ON uc.user_book_id = ub.id
            CROSS JOIN websearch_to_tsquery('english', {{0}}) q
            WHERE ub.user_id = {{1}}
              AND uc.search_vector @@ q
              {(hasTagFilter ? "AND ub.tags @> {2}" : string.Empty)}
            GROUP BY ub.id
            ORDER BY ""Rank"" DESC
            LIMIT {MaxResults};
        ";

        var parameters = hasTagFilter
            ? new object[] { query, userId, tagsArray }
            : new object[] { query, userId };

        var rows = await db.Database
            .SqlQueryRaw<UserBookSearchRow>(sql, parameters)
            .ToListAsync(ct);

        return rows.Select(r => new UserBookSearchHit(
            r.Id, r.Title, r.Author, r.CoverPath, r.Language, r.Rank, r.Excerpt, r.ChapterSlug)).ToList();
    }

    public sealed record UserBookSearchRow(
        Guid Id, string Title, string? Author, string? CoverPath, string Language,
        double Rank, string? Excerpt, string? ChapterSlug);
}

public sealed record UserBookSearchHit(
    Guid Id, string Title, string? Author, string? CoverPath, string Language,
    double Rank, string? Excerpt, string? ChapterSlug);
