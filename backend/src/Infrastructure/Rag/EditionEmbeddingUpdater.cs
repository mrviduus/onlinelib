using System.Data;

namespace Infrastructure.Rag;

/// <summary>
/// AI-054: recomputes <c>editions.embedding</c> as the element-wise mean-pool
/// (<c>AVG(vector)</c>) of the edition's already-embedded <c>chapter_chunk</c> rows.
/// Pure SQL — reuses existing chunk embeddings, makes NO OpenAI calls ($0).
///
/// EF's pgvector value converter can't aggregate vectors, so this runs raw SQL over
/// the caller's connection (the going-forward worker hook + the backfill CLI both
/// route through <see cref="RecomputeAsync"/>).
///
/// Stores the RAW mean (NOT L2-normalized): the similarity endpoint (AI-055) MUST
/// query with cosine distance (<c>vector_cosine_ops</c> / <c>&lt;=&gt;</c>), which is
/// scale-invariant — using L2 there would be incorrect against an un-normalized mean.
/// </summary>
public static class EditionEmbeddingUpdater
{
    /// <summary>
    /// Mean-pool UPDATE. <c>@editionId = NULL</c> → backfill every edition that has
    /// embedded chunks; a specific id → recompute just that edition. Only FULLY-embedded
    /// editions are written: the <c>NOT EXISTS</c> guard excludes any edition that still has
    /// a null-embedding chunk, so a half-embedded edition is skipped (it stays NULL, or keeps
    /// its prior full value) until every chunk is embedded — never a transient PARTIAL mean.
    /// This guard is the single source of truth; both callers (worker single-edition hook +
    /// backfill-all CLI) inherit it regardless of any pre-check.
    /// </summary>
    public const string MeanPoolSql = """
        UPDATE editions e
        SET embedding = sub.avg_vec
        FROM (
            SELECT edition_id, AVG(embedding) AS avg_vec
            FROM chapter_chunk cc
            WHERE embedding IS NOT NULL
              AND (@editionId::uuid IS NULL OR edition_id = @editionId::uuid)
              AND NOT EXISTS (
                  SELECT 1 FROM chapter_chunk cc2
                  WHERE cc2.edition_id = cc.edition_id AND cc2.embedding IS NULL
              )
            GROUP BY edition_id
        ) sub
        WHERE e.id = sub.edition_id;
        """;

    /// <summary>
    /// Runs the mean-pool UPDATE. Returns the number of edition rows written.
    /// <paramref name="editionId"/> = <c>null</c> backfills all editions; a value
    /// recomputes a single edition. Idempotent / re-runnable.
    /// </summary>
    public static async Task<int> RecomputeAsync(
        IDbConnection connection, Guid? editionId, CancellationToken ct)
    {
        if (connection.State != ConnectionState.Open)
        {
            if (connection is System.Data.Common.DbConnection dbConn)
                await dbConn.OpenAsync(ct);
            else
                connection.Open();
        }

        await using var cmd = (System.Data.Common.DbCommand)connection.CreateCommand();
        cmd.CommandText = MeanPoolSql;

        var param = cmd.CreateParameter();
        param.ParameterName = "editionId";
        param.Value = (object?)editionId ?? DBNull.Value;
        cmd.Parameters.Add(param);

        return await cmd.ExecuteNonQueryAsync(ct);
    }
}
