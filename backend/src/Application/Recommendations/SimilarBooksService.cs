using System.Data;
using System.Globalization;
using System.Text;
using Contracts.Books;
using Dapper;
using Domain.Enums;

namespace Application.Recommendations;

/// <summary>
/// AI-055: "Similar books" — cosine-NN over <c>editions.embedding</c> (the AI-054 raw mean-pool
/// vector). Two raw-Npgsql + Dapper statements (a raw connection doesn't register the pgvector
/// type, so the vector is passed as a text literal and cast server-side with <c>CAST(@vec AS vector)</c>):
///   1. Resolve the subject edition by (site, language, slug) + read its embedding.
///   2. NN scan: nearest published editions by cosine distance (<c>&lt;=&gt;</c>), excluding the
///      subject's Work (all languages) and applying catalog visibility.
/// The query vector is passed as a PARAM (not a correlated subquery) so the HNSW
/// <c>vector_cosine_ops</c> index serves the ORDER BY. Cost: $0 — no LLM, pure vector math.
/// </summary>
public sealed class SimilarBooksService
{
    private const int QueryTimeoutSeconds = 5;
    private const int DefaultLimit = 8;
    private const int MaxLimit = 24;

    private readonly Func<IDbConnection> _connectionFactory;

    public SimilarBooksService(Func<IDbConnection> connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    /// <summary>Clamps a caller-supplied limit into [1, 24], defaulting to 8 for &lt;= 0.</summary>
    public static int ClampLimit(int limit) =>
        limit <= 0 ? DefaultLimit : Math.Min(limit, MaxLimit);

    /// <summary>
    /// Returns up to <paramref name="limit"/> published editions most similar to the subject
    /// identified by (<paramref name="siteId"/>, <paramref name="language"/>, <paramref name="slug"/>),
    /// ordered most-similar-first. Returns <c>null</c> when the subject is not found (→ 404),
    /// or an empty list when the subject has no embedding / has no similar editions (→ 200).
    /// </summary>
    public async Task<IReadOnlyList<SimilarBookDto>?> GetSimilarAsync(
        Guid siteId, string slug, string language, int limit, CancellationToken ct)
    {
        var clamped = ClampLimit(limit);

        using var connection = _connectionFactory();

        // status = 1 = EditionStatus.Published ordinal (Draft=0, Published=1, Hidden=2). The unit
        // test asserts (int)EditionStatus.Published == 1 so a future enum reorder fails loudly.
        const string subjectSql = """
            SELECT id            AS Id,
                   work_id       AS WorkId,
                   embedding::text AS Embedding
            FROM editions
            WHERE site_id = @siteId
              AND slug = @slug
              AND language = @lang
              AND status = 1
            LIMIT 1;
            """;

        var subject = await connection.QuerySingleOrDefaultAsync<SubjectRow>(
            new CommandDefinition(
                subjectSql,
                new { siteId, slug, lang = language },
                cancellationToken: ct,
                commandTimeout: QueryTimeoutSeconds));

        // Subject slug not found → null → endpoint returns 404.
        if (subject is null)
            return null;

        // Subject exists but isn't embedded yet → no basis for similarity → empty list (200).
        if (string.IsNullOrEmpty(subject.Embedding))
            return [];

        // @vec = the subject's raw mean vector as a pgvector literal. ORDER BY uses the PARAM
        // (not a correlated subquery) so the HNSW vector_cosine_ops index can serve it.
        // <=> = cosine DISTANCE (lower = closer); 1 - distance = cosine similarity (Score, higher
        // better); ORDER BY distance ASC = most similar first. work_id <> @subjectWorkId excludes
        // the subject itself AND its other-language editions (same Work). EXISTS(chapters) mirrors
        // the catalog "has readable content" filter from BookService.
        const string scanSql = """
            SELECT e.slug      AS Slug,
                   e.title     AS Title,
                   e.language  AS Language,
                   e.cover_path AS CoverPath,
                   1 - (e.embedding <=> CAST(@vec AS vector)) AS Score
            FROM editions e
            WHERE e.site_id = @siteId
              AND e.status = 1
              AND e.language = @lang
              AND e.work_id <> @subjectWorkId
              AND e.embedding IS NOT NULL
              AND EXISTS (SELECT 1 FROM chapters c WHERE c.edition_id = e.id)
            ORDER BY e.embedding <=> CAST(@vec AS vector)
            LIMIT @limit;
            """;

        var rows = await connection.QueryAsync<SimilarBookDto>(
            new CommandDefinition(
                scanSql,
                new
                {
                    siteId,
                    lang = language,
                    subjectWorkId = subject.WorkId,
                    vec = subject.Embedding, // already an "[v0,v1,…]" literal from embedding::text
                    limit = clamped,
                },
                cancellationToken: ct,
                commandTimeout: QueryTimeoutSeconds));

        return rows.ToList();
    }

    /// <summary>Dapper row for the subject lookup.</summary>
    private sealed class SubjectRow
    {
        public Guid Id { get; init; }
        public Guid WorkId { get; init; }

        /// <summary>The subject's <c>embedding::text</c> ("[v0,v1,…]") or NULL when unembedded.</summary>
        public string? Embedding { get; init; }
    }

    /// <summary>
    /// Formats an embedding as a pgvector text literal <c>[v0,v1,…]</c> using invariant culture
    /// (a comma-decimal locale can't corrupt the literal). "G9" is the shortest round-trippable
    /// form for float. Copied from <c>TextStack.Ai.Rag.RagService.FormatVector</c> to avoid an
    /// Application → Ai.Rag dependency. Cast to <c>vector</c> in SQL.
    /// </summary>
    public static string FormatVector(IReadOnlyList<float> vector)
    {
        var sb = new StringBuilder(vector.Count * 8 + 2);
        sb.Append('[');
        for (var i = 0; i < vector.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append(vector[i].ToString("G9", CultureInfo.InvariantCulture));
        }
        sb.Append(']');
        return sb.ToString();
    }
}
