using Infrastructure.Rag;

namespace TextStack.UnitTests;

/// <summary>
/// AI-054: contract guards on the mean-pool SQL. The element-wise average correctness is
/// asserted DB-side (integration, real pgvector AVG). Here we lock the load-bearing clauses
/// the design depends on, so a future refactor can't silently drop them.
/// </summary>
public class EditionEmbeddingUpdaterTests
{
    [Fact]
    public void MeanPoolSql_AveragesChunkEmbeddingsGroupedByEdition()
    {
        var sql = EditionEmbeddingUpdater.MeanPoolSql;
        Assert.Contains("UPDATE editions", sql);
        Assert.Contains("AVG(embedding)", sql);
        Assert.Contains("FROM chapter_chunk", sql);
        Assert.Contains("GROUP BY edition_id", sql);
        // The write target must be editions.embedding, and the pooled mean must be
        // joined back per-edition — dropping either silently corrupts the backfill.
        Assert.Contains("SET embedding = sub.avg_vec", sql);
        Assert.Contains("WHERE e.id = sub.edition_id", sql);
    }

    [Fact]
    public void MeanPoolSql_SkipsNullChunkEmbeddings()
    {
        // Editions with only un-embedded chunks must stay NULL (no partial mean) — the
        // IS NOT NULL filter is what keeps them out of the GROUP BY result.
        Assert.Contains("embedding IS NOT NULL", EditionEmbeddingUpdater.MeanPoolSql);
    }

    [Fact]
    public void MeanPoolSql_SkipsPartiallyEmbeddedEditions()
    {
        // P2 guard: an edition with ANY null-embedding chunk must be excluded from the GROUP BY
        // so it never gets a transient PARTIAL mean (it stays NULL / keeps its prior full value
        // until fully embedded). The NOT EXISTS subquery, correlated on edition_id, is what
        // enforces this — and it's the single source of truth for BOTH callers (worker + backfill).
        var sql = EditionEmbeddingUpdater.MeanPoolSql;
        Assert.Contains("NOT EXISTS", sql);
        Assert.Contains("cc2.edition_id = cc.edition_id", sql);
        Assert.Contains("cc2.embedding IS NULL", sql);
    }

    [Fact]
    public void MeanPoolSql_SupportsNullParamForBackfillAll()
    {
        // @editionId NULL → backfill every edition; a value → single-edition recompute.
        Assert.Contains("@editionId::uuid IS NULL OR edition_id = @editionId::uuid", EditionEmbeddingUpdater.MeanPoolSql);
    }
}
