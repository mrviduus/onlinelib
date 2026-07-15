using System.Data;
using System.Globalization;
using System.Text;
using Dapper;
using TextStack.Ai.Core;

namespace TextStack.Ai.Rag;

/// <summary>
/// Raw-Npgsql hybrid retrieval (Phase 4 RAG). Runs two independent retrievers over
/// <c>chapter_chunk</c> in one round-trip — semantic (cosine NN over the HNSW <c>vector_cosine_ops</c>
/// index) and lexical (<c>ts_rank_cd</c> over the generated <c>search_vector</c> + GIN index) — then
/// fuses their rankings with <see cref="RrfFusion"/> (AI-023). SQL (not EF) so the spoiler gate
/// (AI-024) lives in both WHEREs. The query vector is passed as a string and cast server-side
/// (<c>CAST(@q AS vector)</c>) — a raw connection doesn't register the pgvector type
/// (<c>UseVector()</c> is EF-only).
/// </summary>
public sealed class RagService : IRagService
{
    private const int QueryTimeoutSeconds = 5;

    /// <summary>Candidates pulled from each retriever before fusion — wider than k so RRF has overlap to reward.</summary>
    private const int MinCandidatePool = 30;

    private readonly Func<IDbConnection> _connectionFactory;
    private readonly IEmbeddingService _embedder;

    public RagService(Func<IDbConnection> connectionFactory, IEmbeddingService embedder)
    {
        _connectionFactory = connectionFactory;
        _embedder = embedder;
    }

    public async Task<IReadOnlyList<RetrievedChunk>> RetrieveAsync(
        Guid editionId, string query, int k, int? maxChapterOrd, bool includeSummaries, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(query))
            return [];

        return await RetrieveHybridAsync(
            query, k,
            BuildCatalogSql(),
            includeSummaries ? BuildCatalogSummarySql() : null,
            withVector => new { q = withVector.Vector, query, editionId, pool = withVector.Pool, maxChapterOrd },
            ct);
    }

    public async Task<IReadOnlyList<RetrievedChunk>> RetrieveUserBookAsync(
        Guid userId, Guid userBookId, string query, int k, int? maxChapterOrd, bool includeSummaries,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(query))
            return [];

        return await RetrieveHybridAsync(
            query, k,
            BuildUserBookSql(),
            includeSummaries ? BuildUserBookSummarySql() : null,
            withVector => new { q = withVector.Vector, query, userId, userBookId, pool = withVector.Pool, maxChapterOrd },
            ct);
    }

    /// <summary>
    /// Shared hybrid retrieval: embeds the query, runs the two given retrievers (vector NN + lexical
    /// FTS, in one round-trip), fuses them with RRF, and materializes the top-k. The two callers only
    /// differ in table + WHERE filter (catalog edition vs isolated user book), supplied via
    /// <paramref name="sql"/> and <paramref name="parameters"/> — so RRF, the pgvector literal format,
    /// pool sizing, and the timeout stay identical between paths.
    ///
    /// When <paramref name="summarySql"/> is non-null (overview-class questions — see
    /// <c>RagAskPrompt.IsOverviewQuestion</c>), a third statement fetches ALL of the book's precomputed
    /// <c>is_summary</c> chunks (still gated + isolated by the same params) in the SAME round-trip; those
    /// summary rows are then GUARANTEED into the result — merged ahead of the organic fused ranking
    /// (<see cref="MergeSummariesFirst"/>) — so "summarize chapter N" always sees the whole-chapter digest
    /// rather than relying on hybrid search to surface it. Summaries also participate organically in the
    /// two hybrid retrievers, so the non-overview path (null summarySql) is byte-identical to before.
    /// </summary>
    private async Task<IReadOnlyList<RetrievedChunk>> RetrieveHybridAsync(
        string query, int k, string sql, string? summarySql,
        Func<(string Vector, int Pool), object> parameters, CancellationToken ct)
    {
        if (k <= 0)
            k = IRagService.DefaultK;

        var queryVector = await _embedder.EmbedAsync(query, ct);
        var vectorLiteral = FormatVector(queryVector);
        var pool = Math.Max(k, MinCandidatePool);

        // Append the summary fetch as a third statement so it rides the same round-trip + timeout.
        var fullSql = summarySql is null ? sql : sql + "\n\n" + summarySql;

        using var connection = _connectionFactory();
        using var multi = await connection.QueryMultipleAsync(
            new CommandDefinition(
                fullSql,
                parameters((vectorLiteral, pool)),
                cancellationToken: ct,
                commandTimeout: QueryTimeoutSeconds));

        var vectorRows = (await multi.ReadAsync<Row>()).ToList();
        var lexicalRows = (await multi.ReadAsync<Row>()).ToList();
        var summaryRows = summarySql is null ? new List<Row>() : (await multi.ReadAsync<Row>()).ToList();

        // Fuse the two rankings by chunk id (RRF), then materialize from either row set.
        var byId = new Dictionary<Guid, Row>();
        foreach (var r in vectorRows) byId[r.ChunkId] = r;
        foreach (var r in lexicalRows) byId.TryAdd(r.ChunkId, r);
        foreach (var r in summaryRows) byId.TryAdd(r.ChunkId, r);

        var fused = RrfFusion.Fuse(new[]
        {
            vectorRows.Select(r => r.ChunkId).ToList(),
            lexicalRows.Select(r => r.ChunkId).ToList(),
        });

        // The organic top-k (unchanged for non-overview queries). When summaries were fetched, guarantee
        // them into the result ahead of the organic ranking; both inputs are already deterministic.
        var fusedIds = fused.Select(f => f.Item).ToList();
        var scoreById = fused.ToDictionary(f => f.Item, f => f.Score);
        var orderedIds = summarySql is null
            ? fusedIds.Take(k).ToList()
            : MergeSummariesFirst(fusedIds, summaryRows.Select(r => r.ChunkId).ToList(), k);

        return orderedIds
            .Select(id =>
            {
                var r = byId[id];
                // Score is the RRF fusion score (not cosine) — see RetrievedChunk.Score. A guaranteed
                // summary not present in the fused ranking gets 0 (it wasn't organically retrieved).
                return new RetrievedChunk(
                    r.ChunkId, r.ChapterId, r.ChapterOrd, r.Ord, r.Text, r.CharStart, r.CharEnd,
                    scoreById.GetValueOrDefault(id, 0.0), r.SourcePage, r.SectionPath);
            })
            .ToList();
    }

    /// <summary>
    /// Deterministic guaranteed-summary merge: the <paramref name="summaryIds"/> (already ordered by
    /// <c>chapter_ord, id</c> from SQL) go FIRST, then the organic <paramref name="fusedOrder"/> ids fill
    /// the remaining slots, deduped by id, capped to <paramref name="k"/>. Prepending guarantees the
    /// whole-chapter summaries survive the top-k trim for an overview question (completeness &gt; a single
    /// pinpoint excerpt); regular chunks still fill the rest. Pure so the ordering + dedup is unit-testable.
    /// </summary>
    public static List<Guid> MergeSummariesFirst(
        IReadOnlyList<Guid> fusedOrder, IReadOnlyList<Guid> summaryIds, int k)
    {
        var result = new List<Guid>(Math.Max(0, k));
        var seen = new HashSet<Guid>();
        foreach (var id in summaryIds)
        {
            if (result.Count >= k) return result;
            if (seen.Add(id)) result.Add(id);
        }
        foreach (var id in fusedOrder)
        {
            if (result.Count >= k) break;
            if (seen.Add(id)) result.Add(id);
        }
        return result;
    }

    /// <summary>Dapper row — a sealed class with init props (the repo's proven mapping shape;
    /// avoids relying on constructor mapping into a record struct).</summary>
    private sealed class Row
    {
        public Guid ChunkId { get; init; }
        // Nullable: user_chapter_id can be null for vision-PDF chunks (ADR-012 S3); catalog chapter_id
        // is always present (maps into the nullable fine).
        public Guid? ChapterId { get; init; }
        public int ChapterOrd { get; init; }
        public int Ord { get; init; }
        public string Text { get; init; } = string.Empty;
        public int CharStart { get; init; }
        public int CharEnd { get; init; }
        public double Score { get; init; }
        // ADR-012 S3 provenance — only SELECTed by the user-book SQL; null for catalog rows (Dapper
        // leaves unmapped columns default).
        public int? SourcePage { get; init; }
        public string? SectionPath { get; init; }
    }

    /// <summary>
    /// The two-statement hybrid SQL for CATALOG retrieval over <c>chapter_chunk</c>, spoiler-gated in
    /// each WHERE (AI-024 — hard SQL filter, never a prompt instruction; null <c>@maxChapterOrd</c> =
    /// no gate): (1) semantic — cosine NN over the embedding (skips not-yet-embedded chunks);
    /// (2) lexical — <c>ts_rank_cd</c> over the generated <c>search_vector</c>.
    /// Both ORDER BYs carry a deterministic <c>id</c> tie-breaker: <c>ts_rank_cd</c> ties are common
    /// and float-distance ties happen on duplicate chunks — without it, tied rows at the LIMIT cutoff
    /// swap between runs (heap-order dependent), changing the fused result. Safe here because both
    /// queries are edition-filtered small scans (the secondary sort key would defeat an ANN index on a
    /// whole-table scan — see HybridCatalogSearch/SimilarBooksService, deliberately left alone).
    /// <c>public static</c> so the determinism invariant is unit-testable without pgvector.
    /// </summary>
    public static string BuildCatalogSql()
    {
        const string vectorSql = """
            SELECT id            AS ChunkId,
                   chapter_id    AS ChapterId,
                   chapter_ord   AS ChapterOrd,
                   ord           AS Ord,
                   text          AS Text,
                   char_start    AS CharStart,
                   char_end      AS CharEnd,
                   1 - (embedding <=> CAST(@q AS vector)) AS Score
            FROM chapter_chunk
            WHERE edition_id = @editionId
              AND embedding IS NOT NULL
              AND (@maxChapterOrd::int IS NULL OR chapter_ord <= @maxChapterOrd::int)
            ORDER BY embedding <=> CAST(@q AS vector), id
            LIMIT @pool;
            """;

        const string lexicalSql = """
            SELECT id            AS ChunkId,
                   chapter_id    AS ChapterId,
                   chapter_ord   AS ChapterOrd,
                   ord           AS Ord,
                   text          AS Text,
                   char_start    AS CharStart,
                   char_end      AS CharEnd,
                   ts_rank_cd(search_vector, tsq) AS Score
            FROM chapter_chunk, websearch_to_tsquery('english', @query) AS tsq
            WHERE edition_id = @editionId
              AND (@maxChapterOrd::int IS NULL OR chapter_ord <= @maxChapterOrd::int)
              AND search_vector @@ tsq
            ORDER BY Score DESC, id
            LIMIT @pool;
            """;

        return vectorSql + "\n\n" + lexicalSql;
    }

    /// <summary>
    /// The two-statement hybrid SQL for USER-book retrieval over the isolated <c>user_chapter_chunk</c>
    /// table. Both retrievers (vector NN + lexical FTS) filter on BOTH <c>user_id</c> AND
    /// <c>user_book_id</c> — a user must NEVER retrieve another user's chunks (per-user isolation,
    /// defense in depth; user_id is the denormalized owner). <c>user_chapter_id</c> is surfaced as
    /// ChapterId for reader deep-links. <c>public static</c> so the isolation invariant (both filters
    /// present) is unit-testable without a live pgvector connection.
    /// </summary>
    public static string BuildUserBookSql()
    {
        const string vectorSql = """
            SELECT id              AS ChunkId,
                   user_chapter_id AS ChapterId,
                   chapter_ord     AS ChapterOrd,
                   ord             AS Ord,
                   text            AS Text,
                   char_start      AS CharStart,
                   char_end        AS CharEnd,
                   source_page     AS SourcePage,
                   section_path    AS SectionPath,
                   1 - (embedding <=> CAST(@q AS vector)) AS Score
            FROM user_chapter_chunk
            WHERE user_id = @userId
              AND user_book_id = @userBookId
              AND embedding IS NOT NULL
              AND (@maxChapterOrd::int IS NULL OR chapter_ord <= @maxChapterOrd::int)
            ORDER BY embedding <=> CAST(@q AS vector), id
            LIMIT @pool;
            """;

        const string lexicalSql = """
            SELECT id              AS ChunkId,
                   user_chapter_id AS ChapterId,
                   chapter_ord     AS ChapterOrd,
                   ord             AS Ord,
                   text            AS Text,
                   char_start      AS CharStart,
                   char_end        AS CharEnd,
                   source_page     AS SourcePage,
                   section_path    AS SectionPath,
                   ts_rank_cd(search_vector, tsq) AS Score
            FROM user_chapter_chunk, websearch_to_tsquery('english', @query) AS tsq
            WHERE user_id = @userId
              AND user_book_id = @userBookId
              AND (@maxChapterOrd::int IS NULL OR chapter_ord <= @maxChapterOrd::int)
              AND search_vector @@ tsq
            ORDER BY Score DESC, id
            LIMIT @pool;
            """;

        return vectorSql + "\n\n" + lexicalSql;
    }

    /// <summary>
    /// Fetches ALL of a CATALOG edition's precomputed summary chunks (<c>is_summary</c>), spoiler-gated by
    /// the SAME <c>@maxChapterOrd</c> as the hybrid retrievers (a summary of an unread chapter must not
    /// leak). No embedding filter — a summary is guaranteed regardless of embedding progress. Deterministic
    /// <c>ORDER BY chapter_ord, id</c> (few rows; the <c>id</c> tie-breaker matches the retrieval invariant).
    /// <c>public static</c> so the <c>is_summary</c> filter + tie-breaker are unit-testable without pgvector.
    /// </summary>
    public static string BuildCatalogSummarySql() => """
        SELECT id            AS ChunkId,
               chapter_id    AS ChapterId,
               chapter_ord   AS ChapterOrd,
               ord           AS Ord,
               text          AS Text,
               char_start    AS CharStart,
               char_end      AS CharEnd,
               0::float8     AS Score
        FROM chapter_chunk
        WHERE edition_id = @editionId
          AND is_summary
          AND (@maxChapterOrd::int IS NULL OR chapter_ord <= @maxChapterOrd::int)
        ORDER BY chapter_ord, id;
        """;

    /// <summary>
    /// Fetches ALL of a USER book's precomputed summary chunks (<c>is_summary</c>), filtered on BOTH
    /// <c>user_id</c> AND <c>user_book_id</c> (per-user isolation, same as the hybrid retrievers) plus the
    /// optional <c>@maxChapterOrd</c> ceiling. No embedding filter. Deterministic
    /// <c>ORDER BY chapter_ord, id</c>. <c>public static</c> so the isolation + tie-breaker are unit-testable.
    /// </summary>
    public static string BuildUserBookSummarySql() => """
        SELECT id              AS ChunkId,
               user_chapter_id AS ChapterId,
               chapter_ord     AS ChapterOrd,
               ord             AS Ord,
               text            AS Text,
               char_start      AS CharStart,
               char_end        AS CharEnd,
               source_page     AS SourcePage,
               section_path    AS SectionPath,
               0::float8       AS Score
        FROM user_chapter_chunk
        WHERE user_id = @userId
          AND user_book_id = @userBookId
          AND is_summary
          AND (@maxChapterOrd::int IS NULL OR chapter_ord <= @maxChapterOrd::int)
        ORDER BY chapter_ord, id;
        """;

    /// <summary>
    /// Formats an embedding as a pgvector text literal <c>[v0,v1,…]</c> using invariant culture
    /// (so a comma-decimal locale can't corrupt the literal). Cast to <c>vector</c> in SQL.
    /// </summary>
    public static string FormatVector(IReadOnlyList<float> vector)
    {
        var sb = new StringBuilder(vector.Count * 8 + 2);
        sb.Append('[');
        for (var i = 0; i < vector.Count; i++)
        {
            if (i > 0) sb.Append(',');
            // "G9" is the shortest round-trippable form for float (preferred over "R").
            sb.Append(vector[i].ToString("G9", CultureInfo.InvariantCulture));
        }
        sb.Append(']');
        return sb.ToString();
    }
}
