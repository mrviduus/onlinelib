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
    private readonly float _fuzzyThreshold;

    public PostgresSearchProvider(
        Func<IDbConnection> connectionFactory,
        IQueryBuilder queryBuilder,
        ITextAnalyzer textAnalyzer,
        HighlightOptions? highlightOptions = null,
        float fuzzyThreshold = 0.3f)
    {
        _connectionFactory = connectionFactory;
        _queryBuilder = queryBuilder;
        _textAnalyzer = textAnalyzer;
        _highlightOptions = highlightOptions ?? HighlightOptions.Default;
        _fuzzyThreshold = fuzzyThreshold;
    }

    public async Task<SearchResult> SearchAsync(SearchRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Query))
            return SearchResult.Empty;

        var ftsConfig = _textAnalyzer.GetFtsConfig(request.Language);
        var tsQuery = _queryBuilder.BuildQuery(request.Query, request.Language);
        var normalizedQuery = _textAnalyzer.Normalize(request.Query);

        // Need either valid tsQuery for FTS or normalizedQuery for LIKE
        if (string.IsNullOrEmpty(tsQuery) && string.IsNullOrEmpty(normalizedQuery))
            return SearchResult.Empty;

        using var connection = _connectionFactory();

        var escapedQuery = EscapeLikePattern(normalizedQuery ?? "");
        var titlePattern = "%" + escapedQuery + "%";
        var authorPattern = "%" + escapedQuery + "%";

        // Count: edition metadata matches + fuzzy title/author + chapter FTS matches (deduplicated)
        var countSql = @"
            SELECT COUNT(*) FROM (
                -- Edition title/author LIKE matches (first chapter per edition)
                SELECT id FROM (
                    SELECT DISTINCT ON (e.id) c.id
                    FROM editions e
                    INNER JOIN chapters c ON c.edition_id = e.id
                    WHERE e.site_id = @SiteId
                      AND e.status = 1
                      AND (lower(e.title) LIKE @TitlePattern OR lower(e.authors_json) LIKE @AuthorPattern)
                    ORDER BY e.id, c.chapter_number
                ) metadata_matches
                UNION
                -- Fuzzy title matches (similarity > @FuzzyThreshold)
                SELECT id FROM (
                    SELECT DISTINCT ON (e.id) c.id
                    FROM editions e
                    INNER JOIN chapters c ON c.edition_id = e.id
                    WHERE e.site_id = @SiteId
                      AND e.status = 1
                      AND similarity(lower(e.title), @NormalizedQuery) > @FuzzyThreshold
                    ORDER BY e.id, c.chapter_number
                ) fuzzy_title_matches
                UNION
                -- Fuzzy author matches (similarity > @FuzzyThreshold)
                SELECT id FROM (
                    SELECT DISTINCT ON (e.id) c.id
                    FROM editions e
                    INNER JOIN chapters c ON c.edition_id = e.id
                    WHERE e.site_id = @SiteId
                      AND e.status = 1
                      AND similarity(lower(e.authors_json), @NormalizedQuery) > @FuzzyThreshold
                    ORDER BY e.id, c.chapter_number
                ) fuzzy_author_matches
                UNION
                -- Chapter content FTS matches
                SELECT c.id
                FROM chapters c
                INNER JOIN editions e ON c.edition_id = e.id
                WHERE e.site_id = @SiteId
                  AND e.status = 1
                  AND @TsQuery != ''
                  AND c.search_vector @@ to_tsquery(@FtsConfig::regconfig, @TsQuery)
            ) combined";

        var totalCount = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(countSql, new
            {
                request.SiteId,
                FtsConfig = ftsConfig,
                TsQuery = tsQuery ?? "",
                TitlePattern = titlePattern,
                AuthorPattern = authorPattern,
                NormalizedQuery = normalizedQuery ?? "",
                FuzzyThreshold = _fuzzyThreshold
            }, cancellationToken: ct));

        if (totalCount == 0)
            return SearchResult.Empty;

        // Search: combine edition metadata matches (high score) with chapter FTS matches
        var highlightExpr = request.IncludeHighlights && !string.IsNullOrEmpty(tsQuery)
            ? $"ts_headline(@FtsConfig::regconfig, c.plain_text, to_tsquery(@FtsConfig::regconfig, @TsQuery), '{_highlightOptions.ToOptionsString()}')"
            : "NULL";

        var searchSql = $@"
            SELECT * FROM (
                -- Edition title/author LIKE matches: return first chapter, high score (10.0)
                SELECT * FROM (
                    SELECT DISTINCT ON (e.id)
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
                        10.0::float8 AS Score,
                        NULL::text AS Headline
                    FROM editions e
                    INNER JOIN chapters c ON c.edition_id = e.id
                    WHERE e.site_id = @SiteId
                      AND e.status = 1
                      AND (lower(e.title) LIKE @TitlePattern OR lower(e.authors_json) LIKE @AuthorPattern)
                    ORDER BY e.id, c.chapter_number
                ) metadata_matches

                UNION ALL

                -- Fuzzy title matches: score = similarity * 8.0
                SELECT * FROM (
                    SELECT DISTINCT ON (e.id)
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
                        (similarity(lower(e.title), @NormalizedQuery) * 8.0)::float8 AS Score,
                        NULL::text AS Headline
                    FROM editions e
                    INNER JOIN chapters c ON c.edition_id = e.id
                    WHERE e.site_id = @SiteId
                      AND e.status = 1
                      AND similarity(lower(e.title), @NormalizedQuery) > @FuzzyThreshold
                    ORDER BY e.id, c.chapter_number
                ) fuzzy_title_matches

                UNION ALL

                -- Fuzzy author matches: score = similarity * 6.0
                SELECT * FROM (
                    SELECT DISTINCT ON (e.id)
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
                        (similarity(lower(e.authors_json), @NormalizedQuery) * 6.0)::float8 AS Score,
                        NULL::text AS Headline
                    FROM editions e
                    INNER JOIN chapters c ON c.edition_id = e.id
                    WHERE e.site_id = @SiteId
                      AND e.status = 1
                      AND similarity(lower(e.authors_json), @NormalizedQuery) > @FuzzyThreshold
                    ORDER BY e.id, c.chapter_number
                ) fuzzy_author_matches

                UNION ALL

                -- Chapter content FTS matches
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
                    ts_rank(c.search_vector, to_tsquery(@FtsConfig::regconfig, @TsQuery))::float8 AS Score,
                    {highlightExpr}::text AS Headline
                FROM chapters c
                INNER JOIN editions e ON c.edition_id = e.id
                WHERE e.site_id = @SiteId
                  AND e.status = 1
                  AND @TsQuery != ''
                  AND c.search_vector @@ to_tsquery(@FtsConfig::regconfig, @TsQuery)
            ) combined
            ORDER BY Score DESC
            OFFSET @Offset
            LIMIT @Limit";

        var rows = await connection.QueryAsync<SearchRow>(
            new CommandDefinition(searchSql, new
            {
                request.SiteId,
                FtsConfig = ftsConfig,
                TsQuery = tsQuery ?? "",
                TitlePattern = titlePattern,
                AuthorPattern = authorPattern,
                NormalizedQuery = normalizedQuery ?? "",
                FuzzyThreshold = _fuzzyThreshold,
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

        // Query edition titles with fuzzy matching (similarity > @FuzzyThreshold)
        // Combines exact prefix matches with fuzzy matches, ordered by similarity score
        // EditionStatus.Published = 1
        var sql = @"
            SELECT DISTINCT ON (lower(e.title))
                e.title AS Text,
                e.slug AS Slug,
                e.authors_json AS AuthorsJson,
                e.cover_path AS CoverPath,
                COUNT(c.id) AS ChapterCount,
                GREATEST(
                    similarity(lower(e.title), @NormalizedQuery),
                    similarity(lower(e.authors_json), @NormalizedQuery)
                ) AS SimilarityScore
            FROM editions e
            LEFT JOIN chapters c ON c.edition_id = e.id
            WHERE e.site_id = @SiteId
              AND e.status = 1
              AND (
                  lower(e.title) LIKE @TitlePattern
                  OR lower(e.authors_json) LIKE @AuthorPattern
                  OR similarity(lower(e.title), @NormalizedQuery) > @FuzzyThreshold
                  OR similarity(lower(e.authors_json), @NormalizedQuery) > @FuzzyThreshold
              )
            GROUP BY e.id, e.title, e.slug, e.authors_json, e.cover_path
            ORDER BY lower(e.title), SimilarityScore DESC, ChapterCount DESC
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
                NormalizedQuery = normalizedPrefix,
                FuzzyThreshold = _fuzzyThreshold,
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
        public double SimilarityScore { get; init; }
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
