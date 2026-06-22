using System.Data;
using Dapper;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using TextStack.Ai.Core;
using TextStack.Ai.Rag;
using TextStack.Search.Abstractions;
using TextStack.Search.Contracts;

namespace Application.Search;

/// <summary>
/// AI-057: hybrid (semantic) catalog search. Blends the existing keyword (FTS) edition ranking with a
/// vector ranking (query embedding vs <c>editions.embedding</c>, the AI-054 mean-pool vector) via RRF
/// (<see cref="RrfFusion"/>), at EDITION granularity — both retrievers already collapse to one row per
/// edition, so <c>edition_id</c> is the shared fusion key. Returns the SAME <see cref="SearchResult"/>
/// shape the pure-FTS path returns (frontend-transparent).
///
/// Only invoked when the caller passes <c>semantic=true</c> with a valid query — the pure-FTS path is
/// untouched (no embed call, no extra query, byte-for-byte unchanged). Lives in Application (not the FTS
/// provider, which has no AI deps) so it can pull <see cref="IEmbeddingService"/> + the editions-cosine
/// SQL together. Cost: one embedding call per semantic search; the vector scan is $0 (pure pgvector).
/// </summary>
public sealed class HybridCatalogSearch
{
    private const int QueryTimeoutSeconds = 5;

    /// <summary>
    /// Candidate pool depth pulled from EACH retriever before fusion. Wider than a typical page so RRF
    /// has overlap to reward; capped so a deep <c>offset</c> can't blow up the scan.
    /// </summary>
    private const int MinCandidatePool = 30;
    private const int MaxCandidatePool = 200;

    private readonly ISearchProvider _searchProvider;
    private readonly Func<IEmbeddingService> _embedderFactory;
    private readonly Func<IDbConnection> _connectionFactory;
    private readonly ILogger<HybridCatalogSearch> _logger;

    // The embedder is resolved LAZILY (Func, not the instance): OpenAiEmbeddingClient THROWS in its
    // ctor on a keyless host, and this service is a handler param resolved on EVERY /search request
    // (even non-semantic). Eagerly resolving it 500'd all catalog search on a keyless stack (e2e).
    // Now only the semantic branch touches it, inside the try/catch → keyless degrades to pure FTS.
    public HybridCatalogSearch(
        ISearchProvider searchProvider,
        Func<IEmbeddingService> embedderFactory,
        Func<IDbConnection> connectionFactory,
        ILogger<HybridCatalogSearch>? logger = null)
    {
        _searchProvider = searchProvider;
        _embedderFactory = embedderFactory;
        _connectionFactory = connectionFactory;
        _logger = logger ?? NullLogger<HybridCatalogSearch>.Instance;
    }

    /// <summary>
    /// Runs the hybrid search for <paramref name="request"/> (its Offset/Limit are the request's page),
    /// returning a <see cref="SearchResult"/> page of the FUSED ranking. The caller guards the ≥2-char /
    /// non-empty query BEFORE calling this (so no embedding call is wasted on a short query).
    /// </summary>
    public async Task<SearchResult> SearchAsync(SearchRequest request, string? language, CancellationToken ct)
    {
        var pageOffset = Math.Max(0, request.Offset);
        var pageLimit = Math.Max(1, request.Limit);

        // The FTS provider paginates internally, so fusing a paginated FTS page with a full vector list
        // would skew RRF (the keyword side would be missing its head). Pull a WIDER candidate pool from
        // offset 0 for BOTH retrievers, fuse, then paginate the FUSED order with the request's page.
        var pool = Math.Clamp(pageOffset + pageLimit, MinCandidatePool, MaxCandidatePool);

        // 1. Keyword (FTS) candidate pool — offset 0, wide limit, highlights ON so we can reuse the
        //    best-chapter snippet for editions that DID match by keyword.
        var ftsRequest = request with { Offset = 0, Limit = pool, IncludeHighlights = true };
        var ftsResult = await _searchProvider.SearchAsync(ftsRequest, ct);

        // FTS hit keyed by edition id (best-chapter row for that edition). Order preserved for RRF.
        var ftsByEdition = new Dictionary<Guid, SearchHit>();
        var ftsOrder = new List<Guid>();
        foreach (var hit in ftsResult.Hits)
        {
            var editionId = EditionIdOf(hit);
            if (editionId == Guid.Empty || ftsByEdition.ContainsKey(editionId))
                continue;
            ftsByEdition[editionId] = hit;
            ftsOrder.Add(editionId);
        }

        // 2. Vector candidate pool — query embedding vs editions.embedding (cosine NN). Mirrors the
        //    AI-055 visibility predicate exactly. The embed call (external: OpenAI) and the vector-rank
        //    SQL are the only fragile steps here; semantic search is an ENHANCEMENT, so if either fails
        //    (embedder down/throttled/timeout, vector query error) we degrade to the pure-FTS result
        //    rather than 500 the whole catalog search. Genuine request cancellation still propagates.
        IReadOnlyList<Guid> vectorOrder;
        try
        {
            var queryVector = await _embedderFactory().EmbedAsync(request.Query, ct);
            vectorOrder = await VectorRankAsync(request.SiteId, language, queryVector, pool, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Fall back to the verbatim pure-FTS path so the result is byte-identical to a normal keyword
            // search (correct TotalCount + pagination) — a semantic search that can't reach the embedder
            // simply behaves like a keyword search.
            _logger.LogWarning(ex, "Hybrid search semantic step failed; falling back to FTS-only result.");
            return await _searchProvider.SearchAsync(request, ct);
        }

        // 3. Fuse the two edition-id rankings (RRF). An edition matched by BOTH retrievers floats up.
        var fused = RrfFusion.Fuse(new[] { ftsOrder, vectorOrder });

        // TotalCount = approximate: distinct editions across the fused candidate pool (v1; an exact
        // count would need a second full scan — deferred).
        var totalCount = fused.Count;

        // 4. Paginate the FUSED order with the request's page.
        var pageEditionIds = fused
            .Skip(pageOffset)
            .Take(pageLimit)
            .Select(f => f.Item)
            .ToList();

        if (pageEditionIds.Count == 0)
            return SearchResult.FromHits([], totalCount);

        // 5. Materialize page DTOs. Reuse the FTS hit (with its snippet) where present; for vector-only
        //    editions (no keyword match → no snippet) fetch metadata + a first-chapter fallback with
        //    EMPTY highlights.
        var vectorOnlyIds = pageEditionIds.Where(id => !ftsByEdition.ContainsKey(id)).ToList();
        var vectorOnlyHits = await FetchVectorOnlyHitsAsync(request.SiteId, vectorOnlyIds, ct);

        var hits = new List<SearchHit>(pageEditionIds.Count);
        foreach (var editionId in pageEditionIds)
        {
            if (ftsByEdition.TryGetValue(editionId, out var ftsHit))
                hits.Add(ftsHit);
            else if (vectorOnlyHits.TryGetValue(editionId, out var vHit))
                hits.Add(vHit);
            // else: edition vanished between the rank scan and the materialize fetch (e.g. just
            // unpublished) — skip it rather than emit a hollow row.
        }

        return SearchResult.FromHits(hits, totalCount);
    }

    /// <summary>
    /// Edition-level cosine NN over <c>editions.embedding</c> — mirrors the AI-055 visibility predicate
    /// (site, <c>status = 1</c> Published ordinal, <c>embedding IS NOT NULL</c>, language, EXISTS chapters).
    /// Returns just the ordered edition ids (most-similar first); the query vector is a PARAM so the HNSW
    /// <c>vector_cosine_ops</c> index serves the ORDER BY. <c>&lt;=&gt;</c> = cosine distance (the stored
    /// mean is un-normalized → cosine, NOT L2).
    /// </summary>
    private async Task<IReadOnlyList<Guid>> VectorRankAsync(
        Guid siteId, string? language, IReadOnlyList<float> queryVector, int pool, CancellationToken ct)
    {
        const string sql = """
            SELECT e.id
            FROM editions e
            WHERE e.site_id = @siteId
              AND e.status = 1
              AND e.embedding IS NOT NULL
              AND (@lang IS NULL OR e.language = @lang)
              AND EXISTS (SELECT 1 FROM chapters c WHERE c.edition_id = e.id)
            ORDER BY e.embedding <=> CAST(@qvec AS vector)
            LIMIT @pool;
            """;

        using var connection = _connectionFactory();
        var ids = await connection.QueryAsync<Guid>(
            new CommandDefinition(
                sql,
                new
                {
                    siteId,
                    lang = string.IsNullOrEmpty(language) ? null : language,
                    qvec = RagService.FormatVector(queryVector),
                    pool,
                },
                cancellationToken: ct,
                commandTimeout: QueryTimeoutSeconds));

        return ids.ToList();
    }

    /// <summary>
    /// Fetches title/author/cover + a first-chapter (number-ordered) fallback for editions that surfaced
    /// ONLY via the vector retriever (no keyword match → no FTS snippet). Highlights are EMPTY by design —
    /// there is no keyword-matched passage to highlight. Builds a <see cref="SearchHit"/> shaped exactly
    /// like the FTS provider's so the endpoint's DTO mapping is identical.
    /// </summary>
    private async Task<Dictionary<Guid, SearchHit>> FetchVectorOnlyHitsAsync(
        Guid siteId, IReadOnlyList<Guid> editionIds, CancellationToken ct)
    {
        if (editionIds.Count == 0)
            return [];

        const string sql = """
            SELECT
                e.id          AS EditionId,
                e.slug        AS EditionSlug,
                e.title       AS EditionTitle,
                e.language    AS Language,
                e.cover_path  AS CoverPath,
                (SELECT string_agg(a.name, ', ' ORDER BY ea."order")
                 FROM edition_authors ea JOIN authors a ON a.id = ea.author_id
                 WHERE ea.edition_id = e.id) AS Authors,
                fc.id            AS ChapterId,
                fc.slug          AS ChapterSlug,
                fc.title         AS ChapterTitle,
                fc.chapter_number AS ChapterNumber
            FROM editions e
            LEFT JOIN LATERAL (
                SELECT c.id, c.slug, c.title, c.chapter_number
                FROM chapters c
                WHERE c.edition_id = e.id
                ORDER BY c.chapter_number
                LIMIT 1
            ) fc ON true
            WHERE e.site_id = @siteId
              AND e.id = ANY(@ids);
            """;

        using var connection = _connectionFactory();
        var rows = await connection.QueryAsync<VectorOnlyRow>(
            new CommandDefinition(
                sql,
                new { siteId, ids = editionIds.ToArray() },
                cancellationToken: ct,
                commandTimeout: QueryTimeoutSeconds));

        var result = new Dictionary<Guid, SearchHit>();
        foreach (var r in rows)
        {
            var metadata = new Dictionary<string, object>
            {
                ["chapterId"] = r.ChapterId ?? Guid.Empty,
                ["chapterSlug"] = r.ChapterSlug ?? string.Empty,
                ["chapterTitle"] = r.ChapterTitle ?? string.Empty,
                ["chapterNumber"] = r.ChapterNumber ?? 0,
                ["editionId"] = r.EditionId,
                ["editionSlug"] = r.EditionSlug ?? string.Empty,
                ["editionTitle"] = r.EditionTitle ?? string.Empty,
                ["language"] = r.Language ?? string.Empty,
                ["authors"] = r.Authors ?? string.Empty,
                ["coverPath"] = r.CoverPath ?? string.Empty,
            };

            // Empty highlights — no keyword passage exists for a semantic-only hit.
            result[r.EditionId] = new SearchHit(
                (r.ChapterId ?? Guid.Empty).ToString(), 0.0, [], metadata);
        }

        return result;
    }

    private static Guid EditionIdOf(SearchHit hit) =>
        hit.Metadata.TryGetValue("editionId", out var v) && v is Guid g ? g : Guid.Empty;

    private sealed class VectorOnlyRow
    {
        public Guid EditionId { get; init; }
        public string? EditionSlug { get; init; }
        public string? EditionTitle { get; init; }
        public string? Language { get; init; }
        public string? CoverPath { get; init; }
        public string? Authors { get; init; }
        public Guid? ChapterId { get; init; }
        public string? ChapterSlug { get; init; }
        public string? ChapterTitle { get; init; }
        public int? ChapterNumber { get; init; }
    }
}
