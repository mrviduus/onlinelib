using System.Globalization;
using Npgsql;

namespace TextStack.IntegrationTests;

/// <summary>
/// Integration test for AI-058: the new <c>vocabulary_words.embedding vector(1536)</c> column
/// (and its float[] ↔ pgvector conversion) against real Postgres+pgvector. Proves a 1536-dim
/// vector round-trips through the column unchanged.
///
/// Pokes the DB directly via <c>TEST_DB_CONNECTION</c> (same gating pattern as
/// <see cref="EditionEmbeddingMeanPoolTests"/>) and SKIPS when it's unset, so the HTTP-only
/// suite still runs anywhere. Seeds a self-contained user + word (reusing an existing site for
/// the NOT NULL FK), asserts, then cleans up.
/// </summary>
public class VocabularyEmbeddingTests
{
    private static string? DbConn => Environment.GetEnvironmentVariable("TEST_DB_CONNECTION");

    private const int Dim = 1536;

    [Fact]
    public async Task Embedding_WriteVector_ReadsBackEqual()
    {
        Assert.SkipWhen(DbConn is null, "TEST_DB_CONNECTION not set");
        var ct = TestContext.Current.CancellationToken;

        await using var conn = new NpgsqlConnection(DbConn);
        await conn.OpenAsync(ct);

        var (userId, wordId) = await SeedWordAsync(conn, ct);
        try
        {
            // Distinct, known values in the first few dims; rest zero.
            var expected = new float[Dim];
            expected[0] = 0.5f;
            expected[1] = -0.25f;
            expected[2] = 1.0f;
            expected[Dim - 1] = 0.125f;

            await using (var cmd = new NpgsqlCommand(
                "UPDATE vocabulary_words SET embedding = CAST(@vec AS vector) WHERE id = @id", conn))
            {
                cmd.Parameters.AddWithValue("vec", FormatVector(expected));
                cmd.Parameters.AddWithValue("id", wordId);
                Assert.Equal(1, await cmd.ExecuteNonQueryAsync(ct));
            }

            var read = await ReadEmbeddingAsync(conn, wordId, ct);
            Assert.NotNull(read);
            Assert.Equal(Dim, read!.Length);
            Assert.Equal(0.5f, read[0], 3);
            Assert.Equal(-0.25f, read[1], 3);
            Assert.Equal(1.0f, read[2], 3);
            Assert.Equal(0.125f, read[Dim - 1], 3);
        }
        finally
        {
            await CleanupAsync(conn, userId, ct);
        }
    }

    // ---- helpers ----

    private static async Task<(Guid userId, Guid wordId)> SeedWordAsync(NpgsqlConnection conn, CancellationToken ct)
    {
        var siteId = await ScalarGuidAsync(conn, "SELECT id FROM sites LIMIT 1", ct)
            ?? throw new InvalidOperationException("No site row to attach test fixtures to.");

        var userId = Guid.NewGuid();
        var wordId = Guid.NewGuid();
        var suffix = wordId.ToString("N")[..8];

        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO users (id, email, created_at)
            VALUES (@uid, @email, now());

            INSERT INTO vocabulary_words
                (id, user_id, site_id, word, language, stage, interval_days, consecutive_correct,
                 next_review_at, total_reviews, correct_reviews, priority, source, is_retired,
                 created_at, updated_at)
            VALUES
                (@wid, @uid, @site, @word, 'en', 0, 0, 0, now(), 0, 0, 0, 'tap', false, now(), now());
            """, conn);
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("wid", wordId);
        cmd.Parameters.AddWithValue("site", siteId);
        cmd.Parameters.AddWithValue("email", $"ai058-{suffix}@example.test");
        cmd.Parameters.AddWithValue("word", $"ai058{suffix}");
        await cmd.ExecuteNonQueryAsync(ct);

        return (userId, wordId);
    }

    private static async Task<float[]?> ReadEmbeddingAsync(NpgsqlConnection conn, Guid wordId, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(
            "SELECT embedding::text FROM vocabulary_words WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", wordId);
        var scalar = await cmd.ExecuteScalarAsync(ct);
        if (scalar is not string raw)
            return null;
        return raw.Trim('[', ']')
            .Split(',')
            .Select(s => float.Parse(s, CultureInfo.InvariantCulture))
            .ToArray();
    }

    private static async Task CleanupAsync(NpgsqlConnection conn, Guid userId, CancellationToken ct)
    {
        // vocabulary_words cascades off users; deleting the user is enough.
        await using var cmd = new NpgsqlCommand("DELETE FROM users WHERE id = @uid", conn);
        cmd.Parameters.AddWithValue("uid", userId);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task<Guid?> ScalarGuidAsync(NpgsqlConnection conn, string sql, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        var v = await cmd.ExecuteScalarAsync(ct);
        return v is Guid g ? g : null;
    }

    private static string FormatVector(float[] v) =>
        "[" + string.Join(",", v.Select(x => x.ToString("R", CultureInfo.InvariantCulture))) + "]";
}
