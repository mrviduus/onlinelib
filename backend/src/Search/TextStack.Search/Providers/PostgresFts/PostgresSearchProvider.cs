using System.Data;
using Dapper;
using TextStack.Search.Abstractions;
using TextStack.Search.Contracts;
using TextStack.Search.Enums;

namespace TextStack.Search.Providers.PostgresFts;

public sealed class PostgresSearchProvider : ISearchProvider
{
    private const int QueryTimeoutSeconds = 5;

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

    /// <summary>
    /// Single-pass CTE search: count via COUNT(*) OVER(), edition-level dedup,
    /// ts_headline + string_agg only on final paginated rows.
    /// </summary>
    public async Task<SearchResult> SearchAsync(SearchRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Query))
            return SearchResult.Empty;

        var ftsConfig = _textAnalyzer.GetFtsConfig(request.Language);
        var tsQuery = _queryBuilder.BuildQuery(request.Query, request.Language);
        var normalizedQuery = _textAnalyzer.Normalize(request.Query);

        if (string.IsNullOrEmpty(tsQuery) && string.IsNullOrEmpty(normalizedQuery))
            return SearchResult.Empty;

        using var connection = _connectionFactory();

        var escapedQuery = EscapeLikePattern(normalizedQuery ?? "");
        var titlePattern = "%" + escapedQuery + "%";
        var authorPattern = "%" + escapedQuery + "%";

        var highlightExpr = request.IncludeHighlights && !string.IsNullOrEmpty(tsQuery)
            ? $"ts_headline(@FtsConfig::regconfig, c.plain_text, to_tsquery(@FtsConfig::regconfig, @TsQuery), '{_highlightOptions.ToOptionsString()}')"
            : "NULL";

        // Single query: CTE finds matching edition IDs + best score,
        // then joins chapters/authors only for the paginated page.
        var sql = $@"
            WITH matched_editions AS (
                -- Strategy 1: LIKE match on title/author (score = 10.0)
                SELECT e.id AS edition_id, 10.0::float8 AS score, NULL::uuid AS fts_chapter_id
                FROM editions e
                WHERE e.site_id = @SiteId AND e.status = 1
                  AND (lower(e.title) LIKE @TitlePattern
                       OR EXISTS (
                           SELECT 1 FROM edition_authors ea
                           JOIN authors a ON a.id = ea.author_id
                           WHERE ea.edition_id = e.id AND lower(a.name) LIKE @AuthorPattern))

                UNION ALL

                -- Strategy 2: Fuzzy title match (score = similarity * 8.0)
                SELECT e.id, (similarity(lower(e.title), @NormalizedQuery) * 8.0)::float8, NULL::uuid
                FROM editions e
                WHERE e.site_id = @SiteId AND e.status = 1
                  AND similarity(lower(e.title), @NormalizedQuery) > @FuzzyThreshold

                UNION ALL

                -- Strategy 3: Fuzzy author match (score = max similarity * 6.0)
                SELECT e.id,
                       (MAX(similarity(lower(a.name), @NormalizedQuery)) * 6.0)::float8,
                       NULL::uuid
                FROM editions e
                JOIN edition_authors ea ON ea.edition_id = e.id
                JOIN authors a ON a.id = ea.author_id
                WHERE e.site_id = @SiteId AND e.status = 1
                  AND similarity(lower(a.name), @NormalizedQuery) > @FuzzyThreshold
                GROUP BY e.id

                UNION ALL

                -- Strategy 4: FTS on chapter content (score = ts_rank)
                SELECT e.id,
                       ts_rank(c.search_vector, to_tsquery(@FtsConfig::regconfig, @TsQuery))::float8,
                       c.id
                FROM chapters c
                JOIN editions e ON c.edition_id = e.id
                WHERE e.site_id = @SiteId AND e.status = 1
                  AND @TsQuery != ''
                  AND c.search_vector @@ to_tsquery(@FtsConfig::regconfig, @TsQuery)
            ),
            deduped AS (
                SELECT edition_id,
                       MAX(score) AS score,
                       -- pick the best FTS chapter if any
                       (array_agg(fts_chapter_id ORDER BY score DESC) FILTER (WHERE fts_chapter_id IS NOT NULL))[1] AS best_chapter_id,
                       COUNT(*) OVER() AS total_count
                FROM matched_editions
                GROUP BY edition_id
                ORDER BY MAX(score) DESC
                OFFSET @Offset
                LIMIT @Limit
            )
            SELECT
                d.total_count AS TotalCount,
                COALESCE(bc.id, fc.id) AS ChapterId,
                COALESCE(bc.slug, fc.slug) AS ChapterSlug,
                COALESCE(bc.title, fc.title) AS ChapterTitle,
                COALESCE(bc.chapter_number, fc.chapter_number) AS ChapterNumber,
                e.id AS EditionId,
                e.slug AS EditionSlug,
                e.title AS EditionTitle,
                e.language AS Language,
                (SELECT string_agg(a.name, ', ' ORDER BY ea.""order"")
                 FROM edition_authors ea JOIN authors a ON a.id = ea.author_id
                 WHERE ea.edition_id = e.id) AS Authors,
                e.cover_path AS CoverPath,
                d.score AS Score,
                {highlightExpr}::text AS Headline
            FROM deduped d
            JOIN editions e ON e.id = d.edition_id
            -- best FTS chapter (may be null)
            LEFT JOIN chapters fc ON fc.id = d.best_chapter_id
            -- fallback: first chapter of edition
            LEFT JOIN LATERAL (
                SELECT c2.id, c2.slug, c2.title, c2.chapter_number
                FROM chapters c2
                WHERE c2.edition_id = d.edition_id
                ORDER BY c2.chapter_number
                LIMIT 1
            ) bc ON d.best_chapter_id IS NULL
            -- for ts_headline: need the chapter with content
            LEFT JOIN chapters c ON c.id = COALESCE(fc.id, bc.id)
            ORDER BY d.score DESC";

        var rows = (await connection.QueryAsync<SearchRowWithCount>(
            new CommandDefinition(sql, new
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
            }, cancellationToken: ct, commandTimeout: QueryTimeoutSeconds))).ToList();

        if (rows.Count == 0)
            return SearchResult.Empty;

        var totalCount = rows[0].TotalCount;
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

        var sql = @"
            SELECT DISTINCT ON (lower(e.title))
                e.title AS Text,
                e.slug AS Slug,
                (SELECT string_agg(a.name, ', ' ORDER BY ea.""order"") FROM edition_authors ea JOIN authors a ON a.id = ea.author_id WHERE ea.edition_id = e.id) AS Authors,
                e.cover_path AS CoverPath,
                COUNT(c.id) AS ChapterCount,
                GREATEST(
                    similarity(lower(e.title), @NormalizedQuery),
                    COALESCE((SELECT MAX(similarity(lower(a.name), @NormalizedQuery)) FROM edition_authors ea JOIN authors a ON a.id = ea.author_id WHERE ea.edition_id = e.id), 0)
                ) AS SimilarityScore
            FROM editions e
            LEFT JOIN chapters c ON c.edition_id = e.id
            WHERE e.site_id = @SiteId
              AND e.status = 1
              AND (
                  lower(e.title) LIKE @TitlePattern
                  OR EXISTS (SELECT 1 FROM edition_authors ea JOIN authors a ON a.id = ea.author_id WHERE ea.edition_id = e.id AND lower(a.name) LIKE @AuthorPattern)
                  OR similarity(lower(e.title), @NormalizedQuery) > @FuzzyThreshold
                  OR EXISTS (SELECT 1 FROM edition_authors ea JOIN authors a ON a.id = ea.author_id WHERE ea.edition_id = e.id AND similarity(lower(a.name), @NormalizedQuery) > @FuzzyThreshold)
              )
            GROUP BY e.id, e.title, e.slug, e.cover_path
            ORDER BY lower(e.title), SimilarityScore DESC, ChapterCount DESC
            LIMIT @Limit";

        var escapedPrefix = EscapeLikePattern(normalizedPrefix);
        var titlePattern = escapedPrefix + "%";
        var authorPattern = "%" + escapedPrefix + "%";

        var rows = await connection.QueryAsync<SuggestionRow>(
            new CommandDefinition(sql, new
            {
                SiteId = siteId,
                TitlePattern = titlePattern,
                AuthorPattern = authorPattern,
                NormalizedQuery = normalizedPrefix,
                FuzzyThreshold = _fuzzyThreshold,
                Limit = limit
            }, cancellationToken: ct, commandTimeout: QueryTimeoutSeconds));

        var suggestions = rows.ToList();
        if (suggestions.Count == 0)
            return [];

        var maxCount = suggestions.Max(s => s.ChapterCount);
        return suggestions
            .Select(s => new Suggestion(
                s.Text,
                s.Slug,
                s.Authors,
                s.CoverPath,
                maxCount > 0 ? (double)s.ChapterCount / maxCount : 1.0))
            .ToList();
    }

    private static string EscapeLikePattern(string pattern)
    {
        return pattern
            .Replace("\\", "\\\\")
            .Replace("%", "\\%")
            .Replace("_", "\\_");
    }

    private static SearchHit MapToSearchHit(SearchRowWithCount row, bool includeHighlights)
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
            ["authors"] = row.Authors ?? string.Empty,
            ["coverPath"] = row.CoverPath ?? string.Empty
        };

        var highlights = includeHighlights && !string.IsNullOrEmpty(row.Headline)
            ? [PostgresHighlighter.ParseTsHeadlineResult(row.Headline, "content")]
            : Array.Empty<Highlight>();

        return new SearchHit(row.ChapterId.ToString(), row.Score, highlights, metadata);
    }

    private sealed class SuggestionRow
    {
        public string Text { get; init; } = string.Empty;
        public string Slug { get; init; } = string.Empty;
        public string? Authors { get; init; }
        public string? CoverPath { get; init; }
        public int ChapterCount { get; init; }
        public double SimilarityScore { get; init; }
    }

    private sealed class SearchRowWithCount
    {
        public int TotalCount { get; init; }
        public Guid ChapterId { get; init; }
        public string? ChapterSlug { get; init; }
        public string? ChapterTitle { get; init; }
        public int ChapterNumber { get; init; }
        public Guid EditionId { get; init; }
        public string? EditionSlug { get; init; }
        public string? EditionTitle { get; init; }
        public string? Language { get; init; }
        public string? Authors { get; init; }
        public string? CoverPath { get; init; }
        public double Score { get; init; }
        public string? Headline { get; init; }
    }
}
