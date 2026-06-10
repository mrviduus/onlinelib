using System.Data;
using System.Globalization;
using System.Text;
using Dapper;
using TextStack.Ai.Core;

namespace TextStack.Ai.Rag;

/// <summary>
/// Raw-Npgsql vector retrieval (Phase 4 RAG). Embeds the query via <see cref="IEmbeddingService"/>
/// and runs a cosine-distance nearest-neighbour search over <c>chapter_chunk</c> using the HNSW
/// <c>vector_cosine_ops</c> index. SQL (not EF) so the spoiler gate (AI-024) can live in the WHERE.
/// The query vector is passed as a string and cast server-side (<c>CAST(@q AS vector)</c>) — a raw
/// connection doesn't have the pgvector type registered (<c>UseVector()</c> is EF-only).
/// </summary>
public sealed class RagService : IRagService
{
    private const int QueryTimeoutSeconds = 5;

    private readonly Func<IDbConnection> _connectionFactory;
    private readonly IEmbeddingService _embedder;

    public RagService(Func<IDbConnection> connectionFactory, IEmbeddingService embedder)
    {
        _connectionFactory = connectionFactory;
        _embedder = embedder;
    }

    public async Task<IReadOnlyList<RetrievedChunk>> RetrieveAsync(
        Guid editionId, string query, int k, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(query))
            return [];
        if (k <= 0)
            k = IRagService.DefaultK;

        var queryVector = await _embedder.EmbedAsync(query, ct);
        var vectorLiteral = FormatVector(queryVector);

        const string sql = """
            SELECT id            AS ChunkId,
                   chapter_id    AS ChapterId,
                   chapter_ord   AS ChapterOrd,
                   ord           AS Ord,
                   text          AS Text,
                   char_start    AS CharStart,
                   char_end      AS CharEnd,
                   1 - (embedding <=> CAST(@q AS vector)) AS Score
            FROM chapter_chunk
            WHERE edition_id = @editionId AND embedding IS NOT NULL
            ORDER BY embedding <=> CAST(@q AS vector)
            LIMIT @k
            """;

        using var connection = _connectionFactory();
        var rows = await connection.QueryAsync<Row>(
            new CommandDefinition(
                sql,
                new { q = vectorLiteral, editionId, k },
                cancellationToken: ct,
                commandTimeout: QueryTimeoutSeconds));

        return rows
            .Select(r => new RetrievedChunk(
                r.ChunkId, r.ChapterId, r.ChapterOrd, r.Ord, r.Text, r.CharStart, r.CharEnd, r.Score))
            .ToList();
    }

    /// <summary>Dapper row — a sealed class with init props (the repo's proven mapping shape;
    /// avoids relying on constructor mapping into a record struct).</summary>
    private sealed class Row
    {
        public Guid ChunkId { get; init; }
        public Guid ChapterId { get; init; }
        public int ChapterOrd { get; init; }
        public int Ord { get; init; }
        public string Text { get; init; } = string.Empty;
        public int CharStart { get; init; }
        public int CharEnd { get; init; }
        public double Score { get; init; }
    }

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
