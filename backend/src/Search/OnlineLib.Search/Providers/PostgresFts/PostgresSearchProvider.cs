using System.Data;
using Dapper;
using OnlineLib.Search.Abstractions;
using OnlineLib.Search.Contracts;
using OnlineLib.Search.Enums;

namespace OnlineLib.Search.Providers.PostgresFts;

public sealed class PostgresSearchProvider : ISearchProvider
{
    private readonly Func<IDbConnection> _connectionFactory;
    private readonly IQueryBuilder _queryBuilder;
    private readonly ITextAnalyzer _textAnalyzer;
    private readonly HighlightOptions _highlightOptions;

    public PostgresSearchProvider(
        Func<IDbConnection> connectionFactory,
        IQueryBuilder queryBuilder,
        ITextAnalyzer textAnalyzer,
        HighlightOptions? highlightOptions = null)
    {
        _connectionFactory = connectionFactory;
        _queryBuilder = queryBuilder;
        _textAnalyzer = textAnalyzer;
        _highlightOptions = highlightOptions ?? HighlightOptions.Default;
    }

    public async Task<SearchResult> SearchAsync(SearchRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Query))
            return SearchResult.Empty;

        var ftsConfig = _textAnalyzer.GetFtsConfig(request.Language);
        var tsQuery = _queryBuilder.BuildQuery(request.Query, request.Language);

        if (string.IsNullOrEmpty(tsQuery))
            return SearchResult.Empty;

        using var connection = _connectionFactory();

        // Count query (EditionStatus.Published = 1)
        var countSql = @"
            SELECT COUNT(*)
            FROM chapters c
            INNER JOIN editions e ON c.edition_id = e.id
            WHERE e.site_id = @SiteId
              AND e.status = 1
              AND c.search_vector @@ to_tsquery(@FtsConfig::regconfig, @TsQuery)";

        var totalCount = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(countSql, new { request.SiteId, FtsConfig = ftsConfig, TsQuery = tsQuery }, cancellationToken: ct));

        if (totalCount == 0)
            return SearchResult.Empty;

        // Search query with ranking and optional highlights
        var highlightColumn = request.IncludeHighlights
            ? $", ts_headline(@FtsConfig::regconfig, c.plain_text, to_tsquery(@FtsConfig::regconfig, @TsQuery), '{_highlightOptions.ToOptionsString()}') AS Headline"
            : ", NULL AS Headline";

        var searchSql = $@"
            SELECT
                c.id AS ChapterId,
                c.slug AS ChapterSlug,
                c.title AS ChapterTitle,
                c.chapter_number AS ChapterNumber,
                e.id AS EditionId,
                e.slug AS EditionSlug,
                e.title AS EditionTitle,
                e.language AS Language,
                e.authors_json AS AuthorsJson,
                e.cover_path AS CoverPath,
                ts_rank(c.search_vector, to_tsquery(@FtsConfig::regconfig, @TsQuery)) AS Score
                {highlightColumn}
            FROM chapters c
            INNER JOIN editions e ON c.edition_id = e.id
            WHERE e.site_id = @SiteId
              AND e.status = 1
              AND c.search_vector @@ to_tsquery(@FtsConfig::regconfig, @TsQuery)
            ORDER BY Score DESC
            OFFSET @Offset
            LIMIT @Limit";

        var rows = await connection.QueryAsync<SearchRow>(
            new CommandDefinition(searchSql, new
            {
                request.SiteId,
                FtsConfig = ftsConfig,
                TsQuery = tsQuery,
                request.Offset,
                request.Limit
            }, cancellationToken: ct));

        var hits = rows.Select(r => MapToSearchHit(r, request.IncludeHighlights)).ToList();
        return SearchResult.FromHits(hits, totalCount);
    }

    public async Task<IReadOnlyList<Suggestion>> SuggestAsync(
        string prefix,
        Guid siteId,
        int limit = 10,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(prefix) || prefix.Length < 2)
            return [];

        var normalizedPrefix = _textAnalyzer.Normalize(prefix);
        if (string.IsNullOrEmpty(normalizedPrefix))
            return [];

        using var connection = _connectionFactory();

        // Query edition titles matching prefix, ordered by chapter count (popularity)
        // EditionStatus.Published = 1
        var sql = @"
            SELECT DISTINCT ON (lower(e.title))
                e.title AS Text,
                e.slug AS Slug,
                e.authors_json AS AuthorsJson,
                e.cover_path AS CoverPath,
                COUNT(c.id) AS ChapterCount
            FROM editions e
            LEFT JOIN chapters c ON c.edition_id = e.id
            WHERE e.site_id = @SiteId
              AND e.status = 1
              AND (lower(e.title) LIKE @TitlePattern OR lower(e.authors_json) LIKE @AuthorPattern)
            GROUP BY e.id, e.title, e.slug, e.authors_json, e.cover_path
            ORDER BY lower(e.title), ChapterCount DESC
            LIMIT @Limit";

        var escapedPrefix = EscapeLikePattern(normalizedPrefix);
        var titlePattern = escapedPrefix + "%";       // prefix match for titles
        var authorPattern = "%" + escapedPrefix + "%"; // contains match for authors

        var rows = await connection.QueryAsync<SuggestionRow>(
            new CommandDefinition(sql, new
            {
                SiteId = siteId,
                TitlePattern = titlePattern,
                AuthorPattern = authorPattern,
                Limit = limit
            }, cancellationToken: ct));

        // Convert to suggestions with normalized scores (0-1 based on chapter count)
        var suggestions = rows.ToList();
        if (suggestions.Count == 0)
            return [];

        var maxCount = suggestions.Max(s => s.ChapterCount);
        return suggestions
            .Select(s => new Suggestion(s.Text, s.Slug, s.AuthorsJson, s.CoverPath, maxCount > 0 ? (double)s.ChapterCount / maxCount : 1.0))
            .ToList();
    }

    private static string EscapeLikePattern(string pattern)
    {
        // Escape LIKE special characters: % _ \
        return pattern
            .Replace("\\", "\\\\")
            .Replace("%", "\\%")
            .Replace("_", "\\_");
    }

    private sealed class SuggestionRow
    {
        public string Text { get; init; } = string.Empty;
        public string Slug { get; init; } = string.Empty;
        public string? AuthorsJson { get; init; }
        public string? CoverPath { get; init; }
        public int ChapterCount { get; init; }
    }

    private static SearchHit MapToSearchHit(SearchRow row, bool includeHighlights)
    {
        var metadata = new Dictionary<string, object>
        {
            ["chapterId"] = row.ChapterId,
            ["chapterSlug"] = row.ChapterSlug ?? string.Empty,
            ["chapterTitle"] = row.ChapterTitle ?? string.Empty,
            ["chapterNumber"] = row.ChapterNumber,
            ["editionId"] = row.EditionId,
            ["editionSlug"] = row.EditionSlug ?? string.Empty,
            ["editionTitle"] = row.EditionTitle ?? string.Empty,
            ["language"] = row.Language ?? string.Empty,
            ["authorsJson"] = row.AuthorsJson ?? string.Empty,
            ["coverPath"] = row.CoverPath ?? string.Empty
        };

        var highlights = includeHighlights && !string.IsNullOrEmpty(row.Headline)
            ? [PostgresHighlighter.ParseTsHeadlineResult(row.Headline, "content")]
            : Array.Empty<Highlight>();

        return new SearchHit(row.ChapterId.ToString(), row.Score, highlights, metadata);
    }

    private sealed class SearchRow
    {
        public Guid ChapterId { get; init; }
        public string? ChapterSlug { get; init; }
        public string? ChapterTitle { get; init; }
        public int ChapterNumber { get; init; }
        public Guid EditionId { get; init; }
        public string? EditionSlug { get; init; }
        public string? EditionTitle { get; init; }
        public string? Language { get; init; }
        public string? AuthorsJson { get; init; }
        public string? CoverPath { get; init; }
        public double Score { get; init; }
        public string? Headline { get; init; }
    }
}
