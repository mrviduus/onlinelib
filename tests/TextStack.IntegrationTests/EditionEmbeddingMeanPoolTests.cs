using System.Globalization;
using Npgsql;

namespace TextStack.IntegrationTests;

/// <summary>
/// Integration tests for AI-054 edition mean-pool embeddings against real Postgres+pgvector
/// (the docker CI job uses <c>pgvector/pgvector:pg16</c>, so <c>AVG(vector)</c> is available).
///
/// These poke the DB directly via <c>TEST_DB_CONNECTION</c> (same gating pattern as
/// <see cref="DeviceAuthEndpointTests"/>) and SKIP when it's unset, so the HTTP-only suite
/// still runs anywhere. Each test seeds a self-contained site→work→edition→chapter→chunk
/// graph (unique GUIDs), runs the exact mean-pool UPDATE, asserts, then cleans up.
/// </summary>
public class EditionEmbeddingMeanPoolTests
{
    private static string? DbConn => Environment.GetEnvironmentVariable("TEST_DB_CONNECTION");

    private const int Dim = 1536;

    // The production mean-pool statement (mirror of Infrastructure.Rag.EditionEmbeddingUpdater.MeanPoolSql,
    // run here directly so the test exercises the real SQL shape end-to-end on pgvector).
    private const string MeanPoolSql = """
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

    [Fact]
    public async Task MeanPool_EmbeddedChunks_WritesElementWiseAverage()
    {
        Assert.SkipWhen(DbConn is null, "TEST_DB_CONNECTION not set");
        var ct = TestContext.Current.CancellationToken;

        await using var conn = new NpgsqlConnection(DbConn);
        await conn.OpenAsync(ct);

        var (editionId, chapterId) = await SeedEditionAsync(conn, ct);
        try
        {
            // Two chunks with distinct, known embeddings → mean is element-wise (a+b)/2.
            // dim0: 1.0 & 3.0 → 2.0 ; dim1: 0.0 & 2.0 → 1.0 ; rest 0.
            await InsertChunkAsync(conn, editionId, chapterId, ord: 0, Vector(d0: 1.0f, d1: 0.0f), ct);
            await InsertChunkAsync(conn, editionId, chapterId, ord: 1, Vector(d0: 3.0f, d1: 2.0f), ct);

            var updated = await RunMeanPoolAsync(conn, editionId, ct);
            Assert.Equal(1, updated);

            var pooled = await ReadEditionEmbeddingAsync(conn, editionId, ct);
            Assert.NotNull(pooled);
            Assert.Equal(Dim, pooled!.Length);
            Assert.Equal(2.0f, pooled[0], 3);
            Assert.Equal(1.0f, pooled[1], 3);
            Assert.Equal(0.0f, pooled[2], 3);
        }
        finally
        {
            await CleanupAsync(conn, editionId, ct);
        }
    }

    [Fact]
    public async Task MeanPool_AllChunksNullEmbedding_LeavesEditionNull()
    {
        Assert.SkipWhen(DbConn is null, "TEST_DB_CONNECTION not set");
        var ct = TestContext.Current.CancellationToken;

        await using var conn = new NpgsqlConnection(DbConn);
        await conn.OpenAsync(ct);

        var (editionId, chapterId) = await SeedEditionAsync(conn, ct);
        try
        {
            // Chunks exist but none is embedded yet → the GROUP BY produces no row for this
            // edition (the WHERE embedding IS NOT NULL filters them out) → embedding stays NULL.
            await InsertChunkAsync(conn, editionId, chapterId, ord: 0, embedding: null, ct);
            await InsertChunkAsync(conn, editionId, chapterId, ord: 1, embedding: null, ct);

            var updated = await RunMeanPoolAsync(conn, editionId, ct);
            Assert.Equal(0, updated);

            var pooled = await ReadEditionEmbeddingAsync(conn, editionId, ct);
            Assert.Null(pooled);
        }
        finally
        {
            await CleanupAsync(conn, editionId, ct);
        }
    }

    [Fact]
    public async Task MeanPool_PartiallyEmbeddedEdition_LeavesEditionNull()
    {
        Assert.SkipWhen(DbConn is null, "TEST_DB_CONNECTION not set");
        var ct = TestContext.Current.CancellationToken;

        await using var conn = new NpgsqlConnection(DbConn);
        await conn.OpenAsync(ct);

        var (editionId, chapterId) = await SeedEditionAsync(conn, ct);
        try
        {
            // P2: edition mid-drain — one chunk embedded, one still NULL. The NOT EXISTS guard
            // must exclude this edition entirely so it does NOT get a transient PARTIAL mean
            // (the single embedded chunk). It stays NULL until every chunk is embedded.
            await InsertChunkAsync(conn, editionId, chapterId, ord: 0, Vector(d0: 1.0f, d1: 2.0f), ct);
            await InsertChunkAsync(conn, editionId, chapterId, ord: 1, embedding: null, ct);

            var updated = await RunMeanPoolAsync(conn, editionId, ct);
            Assert.Equal(0, updated); // guard excludes the half-embedded edition → no row written

            var pooled = await ReadEditionEmbeddingAsync(conn, editionId, ct);
            Assert.Null(pooled); // NOT a partial mean of the single embedded chunk
        }
        finally
        {
            await CleanupAsync(conn, editionId, ct);
        }
    }

    // ---- helpers ----

    private static async Task<int> RunMeanPoolAsync(NpgsqlConnection conn, Guid editionId, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(MeanPoolSql, conn);
        cmd.Parameters.AddWithValue("editionId", editionId);
        return await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task<(Guid editionId, Guid chapterId)> SeedEditionAsync(NpgsqlConnection conn, CancellationToken ct)
    {
        // Reuse any existing site (FK NOT NULL on works + editions); seeded by migrations.
        var siteId = await ScalarGuidAsync(conn, "SELECT id FROM sites LIMIT 1", ct)
            ?? throw new InvalidOperationException("No site row to attach test fixtures to.");

        var workId = Guid.NewGuid();
        var editionId = Guid.NewGuid();
        var chapterId = Guid.NewGuid();
        var slug = "ai054-" + editionId.ToString("N");

        await using (var cmd = new NpgsqlCommand(
            """
            INSERT INTO works (id, site_id, slug, created_at)
            VALUES (@id, @site, @slug, now());

            INSERT INTO editions
                (id, work_id, site_id, language, slug, title, status, is_public_domain, created_at, updated_at)
            VALUES (@eid, @id, @site, 'en', @slug, 'AI-054 Test', 0, true, now(), now());

            INSERT INTO chapters
                (id, edition_id, chapter_number, slug, title, html, plain_text, created_at, updated_at)
            VALUES (@cid, @eid, 1, @slug, 'C1', '<p>x</p>', 'x', now(), now());
            """, conn))
        {
            cmd.Parameters.AddWithValue("id", workId);
            cmd.Parameters.AddWithValue("eid", editionId);
            cmd.Parameters.AddWithValue("cid", chapterId);
            cmd.Parameters.AddWithValue("site", siteId);
            cmd.Parameters.AddWithValue("slug", slug);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        return (editionId, chapterId);
    }

    private static async Task InsertChunkAsync(
        NpgsqlConnection conn, Guid editionId, Guid chapterId, int ord, float[]? embedding, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO chapter_chunk
                (id, edition_id, chapter_id, ord, chapter_ord, text, embedding, token_count, char_start, char_end, created_at)
            VALUES
                (@id, @eid, @cid, @ord, 1, @text, CAST(@vec AS vector), 1, 0, 1, now())
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid());
        cmd.Parameters.AddWithValue("eid", editionId);
        cmd.Parameters.AddWithValue("cid", chapterId);
        cmd.Parameters.AddWithValue("ord", ord);
        cmd.Parameters.AddWithValue("text", $"chunk {ord}");
        cmd.Parameters.AddWithValue("vec", (object?)(embedding is null ? null : FormatVector(embedding)) ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task<float[]?> ReadEditionEmbeddingAsync(NpgsqlConnection conn, Guid editionId, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(
            "SELECT embedding::text FROM editions WHERE id = @eid", conn);
        cmd.Parameters.AddWithValue("eid", editionId);
        var scalar = await cmd.ExecuteScalarAsync(ct);
        if (scalar is not string raw)
            return null; // DBNull (column is NULL) or no row.
        return raw.Trim('[', ']')
            .Split(',')
            .Select(s => float.Parse(s, CultureInfo.InvariantCulture))
            .ToArray();
    }

    private static async Task CleanupAsync(NpgsqlConnection conn, Guid editionId, CancellationToken ct)
    {
        // chapter_chunk + chapters cascade off editions; deleting the edition (then its work) is enough.
        await using var cmd = new NpgsqlCommand(
            """
            DELETE FROM editions WHERE id = @eid;
            DELETE FROM works w WHERE NOT EXISTS (SELECT 1 FROM editions e WHERE e.work_id = w.id)
                                  AND w.slug LIKE 'ai054-%';
            """, conn);
        cmd.Parameters.AddWithValue("eid", editionId);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task<Guid?> ScalarGuidAsync(NpgsqlConnection conn, string sql, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        var v = await cmd.ExecuteScalarAsync(ct);
        return v is Guid g ? g : null;
    }

    private static float[] Vector(float d0, float d1)
    {
        var v = new float[Dim];
        v[0] = d0;
        v[1] = d1;
        return v;
    }

    private static string FormatVector(float[] v) =>
        "[" + string.Join(",", v.Select(x => x.ToString("R", CultureInfo.InvariantCulture))) + "]";
}
