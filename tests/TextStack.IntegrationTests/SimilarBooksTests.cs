using System.Globalization;
using Application.Recommendations;
using Npgsql;

namespace TextStack.IntegrationTests;

/// <summary>
/// Integration tests for AI-055 <see cref="SimilarBooksService"/> against real Postgres+pgvector
/// (the docker CI job uses <c>pgvector/pgvector:pg16</c>, so the <c>&lt;=&gt;</c> cosine operator +
/// HNSW <c>vector_cosine_ops</c> index are available).
///
/// Like <see cref="EditionEmbeddingMeanPoolTests"/> these poke the DB directly via
/// <c>TEST_DB_CONNECTION</c> and SKIP when it's unset. Each test seeds a self-contained
/// site→work→edition→chapter graph with hand-set <c>editions.embedding</c> vectors (unique GUIDs),
/// runs the real service, asserts ranking + visibility, then cleans up.
/// </summary>
public class SimilarBooksTests
{
    private static string? DbConn => Environment.GetEnvironmentVariable("TEST_DB_CONNECTION");

    private const int Dim = 1536;
    private const string SlugPrefix = "ai055-";

    [Fact]
    public async Task GetSimilarAsync_RanksNearBeforeFar_AndAppliesVisibility()
    {
        Assert.SkipWhen(DbConn is null, "TEST_DB_CONNECTION not set");
        var ct = TestContext.Current.CancellationToken;

        await using var conn = new NpgsqlConnection(DbConn);
        await conn.OpenAsync(ct);

        var siteId = await PrimarySiteIdAsync(conn, ct);
        var otherSiteId = await EnsureSecondSiteAsync(conn, ct);
        var run = Guid.NewGuid().ToString("N")[..8];
        var seeded = new List<Guid>();
        var seededWorks = new List<Guid>();

        try
        {
            // Subject points "right" along dim0.
            var subjectSlug = $"{SlugPrefix}{run}-subject";
            await SeedEditionAsync(conn, siteId, subjectSlug, "en", status: 1,
                embedding: Unit(d0: 1.0f, d1: 0.0f), withChapter: true, run, seeded, seededWorks, ct);

            // NEAR — almost colinear with subject → high cosine similarity.
            var nearSlug = $"{SlugPrefix}{run}-near";
            await SeedEditionAsync(conn, siteId, nearSlug, "en", status: 1,
                embedding: Unit(d0: 0.95f, d1: 0.31f), withChapter: true, run, seeded, seededWorks, ct);

            // FAR — orthogonal → cosine similarity ~0.
            var farSlug = $"{SlugPrefix}{run}-far";
            await SeedEditionAsync(conn, siteId, farSlug, "en", status: 1,
                embedding: Unit(d0: 0.0f, d1: 1.0f), withChapter: true, run, seeded, seededWorks, ct);

            // DRAFT near (status 0) — must be excluded.
            await SeedEditionAsync(conn, siteId, $"{SlugPrefix}{run}-draft", "en", status: 0,
                embedding: Unit(d0: 0.99f, d1: 0.14f), withChapter: true, run, seeded, seededWorks, ct);

            // HIDDEN near (status 2) — must be excluded. The filter is `status = 1` (equality), so
            // Hidden is excluded; a future change to `<> 0` / `>= 1` would leak it. Locked here.
            await SeedEditionAsync(conn, siteId, $"{SlugPrefix}{run}-hidden", "en", status: 2,
                embedding: Unit(d0: 0.97f, d1: 0.24f), withChapter: true, run, seeded, seededWorks, ct);

            // PUBLISHED near but CHAPTERLESS — must be excluded (EXISTS(chapters) catalog filter).
            await SeedEditionAsync(conn, siteId, $"{SlugPrefix}{run}-nochapters", "en", status: 1,
                embedding: Unit(d0: 0.96f, d1: 0.28f), withChapter: false, run, seeded, seededWorks, ct);

            // OTHER-LANGUAGE near (uk), distinct Work — must be excluded (language filter).
            await SeedEditionAsync(conn, siteId, $"{SlugPrefix}{run}-otherlang", "uk", status: 1,
                embedding: Unit(d0: 0.99f, d1: 0.1f), withChapter: true, run, seeded, seededWorks, ct);

            // OTHER-SITE near — must be excluded (site_id filter).
            await SeedEditionAsync(conn, otherSiteId, $"{SlugPrefix}{run}-othersite", "en", status: 1,
                embedding: Unit(d0: 0.98f, d1: 0.2f), withChapter: true, run, seeded, seededWorks, ct);

            // NULL-embedding near — must be excluded (embedding IS NOT NULL).
            await SeedEditionAsync(conn, siteId, $"{SlugPrefix}{run}-nullemb", "en", status: 1,
                embedding: null, withChapter: true, run, seeded, seededWorks, ct);

            // Same-Work other-language edition of the SUBJECT — must be excluded (work_id <> subject).
            // Reuse the subject's work so work_id matches; different language + slug.
            var subjectWorkId = await ScalarGuidAsync(conn,
                $"SELECT work_id FROM editions WHERE slug = '{subjectSlug}' AND site_id = '{siteId}'", ct);
            await SeedEditionForWorkAsync(conn, siteId, subjectWorkId!.Value, $"{SlugPrefix}{run}-subject-uk",
                "uk", status: 1, embedding: Unit(d0: 1.0f, d1: 0.0f), withChapter: true, seeded, ct);

            var sut = new SimilarBooksService(() => new NpgsqlConnection(DbConn!));
            var result = await sut.GetSimilarAsync(siteId, subjectSlug, "en", limit: 8, ct);

            Assert.NotNull(result);
            var slugs = result!.Select(r => r.Slug).ToList();

            // Only near + far remain after visibility filters.
            Assert.Equal(2, result.Count);
            Assert.Contains(nearSlug, slugs);
            Assert.Contains(farSlug, slugs);

            // Excluded: subject itself, draft, hidden, chapterless, other-lang, other-site,
            // null-embedding, same-Work other-lang.
            Assert.DoesNotContain(subjectSlug, slugs);
            Assert.DoesNotContain($"{SlugPrefix}{run}-draft", slugs);
            Assert.DoesNotContain($"{SlugPrefix}{run}-hidden", slugs);
            Assert.DoesNotContain($"{SlugPrefix}{run}-nochapters", slugs);
            Assert.DoesNotContain($"{SlugPrefix}{run}-otherlang", slugs);
            Assert.DoesNotContain($"{SlugPrefix}{run}-othersite", slugs);
            Assert.DoesNotContain($"{SlugPrefix}{run}-nullemb", slugs);
            Assert.DoesNotContain($"{SlugPrefix}{run}-subject-uk", slugs);

            // near ranks before far (cosine similarity Score desc / distance asc).
            Assert.Equal(nearSlug, slugs[0]);
            Assert.True(result[0].Score > result[1].Score,
                $"near Score {result[0].Score} should exceed far Score {result[1].Score}");
        }
        finally
        {
            await CleanupAsync(conn, seeded, run, ct);
        }
    }

    [Fact]
    public async Task GetSimilarAsync_RespectsLimit()
    {
        Assert.SkipWhen(DbConn is null, "TEST_DB_CONNECTION not set");
        var ct = TestContext.Current.CancellationToken;

        await using var conn = new NpgsqlConnection(DbConn);
        await conn.OpenAsync(ct);

        var siteId = await PrimarySiteIdAsync(conn, ct);
        var run = Guid.NewGuid().ToString("N")[..8];
        var seeded = new List<Guid>();
        var seededWorks = new List<Guid>();

        try
        {
            var subjectSlug = $"{SlugPrefix}{run}-subject";
            await SeedEditionAsync(conn, siteId, subjectSlug, "en", status: 1,
                embedding: Unit(d0: 1.0f, d1: 0.0f), withChapter: true, run, seeded, seededWorks, ct);

            // Seed 3 candidates; ask for limit=2.
            for (var i = 0; i < 3; i++)
            {
                await SeedEditionAsync(conn, siteId, $"{SlugPrefix}{run}-cand{i}", "en", status: 1,
                    embedding: Unit(d0: 0.9f - i * 0.1f, d1: 0.1f + i * 0.1f), withChapter: true,
                    run, seeded, seededWorks, ct);
            }

            var sut = new SimilarBooksService(() => new NpgsqlConnection(DbConn!));
            var result = await sut.GetSimilarAsync(siteId, subjectSlug, "en", limit: 2, ct);

            Assert.NotNull(result);
            Assert.Equal(2, result!.Count);
        }
        finally
        {
            await CleanupAsync(conn, seeded, run, ct);
        }
    }

    [Fact]
    public async Task GetSimilarAsync_SubjectHasNullEmbedding_ReturnsEmptyList()
    {
        Assert.SkipWhen(DbConn is null, "TEST_DB_CONNECTION not set");
        var ct = TestContext.Current.CancellationToken;

        await using var conn = new NpgsqlConnection(DbConn);
        await conn.OpenAsync(ct);

        var siteId = await PrimarySiteIdAsync(conn, ct);
        var run = Guid.NewGuid().ToString("N")[..8];
        var seeded = new List<Guid>();
        var seededWorks = new List<Guid>();

        try
        {
            var subjectSlug = $"{SlugPrefix}{run}-subject";
            await SeedEditionAsync(conn, siteId, subjectSlug, "en", status: 1,
                embedding: null, withChapter: true, run, seeded, seededWorks, ct);

            // A perfectly-similar candidate exists, but the subject has no vector → empty (200).
            await SeedEditionAsync(conn, siteId, $"{SlugPrefix}{run}-cand", "en", status: 1,
                embedding: Unit(d0: 1.0f, d1: 0.0f), withChapter: true, run, seeded, seededWorks, ct);

            var sut = new SimilarBooksService(() => new NpgsqlConnection(DbConn!));
            var result = await sut.GetSimilarAsync(siteId, subjectSlug, "en", limit: 8, ct);

            Assert.NotNull(result);
            Assert.Empty(result!);
        }
        finally
        {
            await CleanupAsync(conn, seeded, run, ct);
        }
    }

    [Fact]
    public async Task GetSimilarAsync_SlugNotFound_ReturnsNull()
    {
        Assert.SkipWhen(DbConn is null, "TEST_DB_CONNECTION not set");
        var ct = TestContext.Current.CancellationToken;

        await using var conn = new NpgsqlConnection(DbConn);
        await conn.OpenAsync(ct);

        var siteId = await PrimarySiteIdAsync(conn, ct);

        var sut = new SimilarBooksService(() => new NpgsqlConnection(DbConn!));
        var result = await sut.GetSimilarAsync(siteId, $"{SlugPrefix}does-not-exist-{Guid.NewGuid():N}", "en", 8, ct);

        Assert.Null(result);
    }

    [Fact]
    public async Task GetSimilarAsync_SubjectIsDraft_ReturnsNull()
    {
        // The subject-resolve step filters status = 1, so a Draft/Hidden subject is "not found"
        // (→ 404) — you can't get similar-results for an unpublished book by guessing its slug.
        Assert.SkipWhen(DbConn is null, "TEST_DB_CONNECTION not set");
        var ct = TestContext.Current.CancellationToken;

        await using var conn = new NpgsqlConnection(DbConn);
        await conn.OpenAsync(ct);

        var siteId = await PrimarySiteIdAsync(conn, ct);
        var run = Guid.NewGuid().ToString("N")[..8];
        var seeded = new List<Guid>();
        var seededWorks = new List<Guid>();

        try
        {
            var draftSubject = $"{SlugPrefix}{run}-draftsubject";
            await SeedEditionAsync(conn, siteId, draftSubject, "en", status: 0,
                embedding: Unit(d0: 1.0f, d1: 0.0f), withChapter: true, run, seeded, seededWorks, ct);

            // A perfectly-similar published candidate exists — but the subject is a draft → null.
            await SeedEditionAsync(conn, siteId, $"{SlugPrefix}{run}-cand", "en", status: 1,
                embedding: Unit(d0: 1.0f, d1: 0.0f), withChapter: true, run, seeded, seededWorks, ct);

            var sut = new SimilarBooksService(() => new NpgsqlConnection(DbConn!));
            var result = await sut.GetSimilarAsync(siteId, draftSubject, "en", limit: 8, ct);

            Assert.Null(result);
        }
        finally
        {
            await CleanupAsync(conn, seeded, run, ct);
        }
    }

    // ---- helpers ----

    private static async Task<Guid> PrimarySiteIdAsync(NpgsqlConnection conn, CancellationToken ct) =>
        await ScalarGuidAsync(conn, "SELECT id FROM sites ORDER BY created_at LIMIT 1", ct)
            ?? throw new InvalidOperationException("No site row to attach test fixtures to.");

    /// <summary>Returns a second site id (any site that isn't the primary), creating one if needed.</summary>
    private static async Task<Guid> EnsureSecondSiteAsync(NpgsqlConnection conn, CancellationToken ct)
    {
        var primary = await PrimarySiteIdAsync(conn, ct);
        var existing = await ScalarGuidAsync(conn,
            $"SELECT id FROM sites WHERE id <> '{primary}' LIMIT 1", ct);
        if (existing is not null)
            return existing.Value;

        var id = Guid.NewGuid();
        var code = "ai055site" + id.ToString("N")[..8];
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO sites
                (id, code, primary_domain, default_language, theme, ads_enabled,
                 indexing_enabled, sitemap_enabled, features_json, created_at, updated_at)
            VALUES
                (@id, @code, @domain, 'en', 'default', false, false, true, '{}', now(), now());
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("code", code);
        cmd.Parameters.AddWithValue("domain", code + ".test");
        await cmd.ExecuteNonQueryAsync(ct);
        return id;
    }

    private static async Task SeedEditionAsync(
        NpgsqlConnection conn, Guid siteId, string slug, string language, int status,
        float[]? embedding, bool withChapter, string run, List<Guid> seeded, List<Guid> seededWorks,
        CancellationToken ct)
    {
        var workId = Guid.NewGuid();
        seededWorks.Add(workId);
        await SeedEditionForWorkAsync(conn, siteId, workId, slug, language, status, embedding, withChapter, seeded, ct, run);
    }

    private static async Task SeedEditionForWorkAsync(
        NpgsqlConnection conn, Guid siteId, Guid workId, string slug, string language, int status,
        float[]? embedding, bool withChapter, List<Guid> seeded, CancellationToken ct, string? run = null)
    {
        var editionId = Guid.NewGuid();
        var chapterId = Guid.NewGuid();
        seeded.Add(editionId);

        // Work may already exist (same-Work other-language case) — upsert by id.
        await using (var workCmd = new NpgsqlCommand(
            """
            INSERT INTO works (id, site_id, slug, created_at)
            VALUES (@id, @site, @slug, now())
            ON CONFLICT (id) DO NOTHING;
            """, conn))
        {
            workCmd.Parameters.AddWithValue("id", workId);
            workCmd.Parameters.AddWithValue("site", siteId);
            workCmd.Parameters.AddWithValue("slug", (run ?? "ai055") + "-work-" + workId.ToString("N")[..8]);
            await workCmd.ExecuteNonQueryAsync(ct);
        }

        await using (var edCmd = new NpgsqlCommand(
            """
            INSERT INTO editions
                (id, work_id, site_id, language, slug, title, status, is_public_domain,
                 embedding, created_at, updated_at)
            VALUES
                (@eid, @wid, @site, @lang, @slug, @title, @status, true,
                 CAST(@vec AS vector), now(), now());
            """, conn))
        {
            edCmd.Parameters.AddWithValue("eid", editionId);
            edCmd.Parameters.AddWithValue("wid", workId);
            edCmd.Parameters.AddWithValue("site", siteId);
            edCmd.Parameters.AddWithValue("lang", language);
            edCmd.Parameters.AddWithValue("slug", slug);
            edCmd.Parameters.AddWithValue("title", "AI-055 " + slug);
            edCmd.Parameters.AddWithValue("status", status);
            edCmd.Parameters.AddWithValue("vec",
                (object?)(embedding is null ? null : FormatVector(embedding)) ?? DBNull.Value);
            await edCmd.ExecuteNonQueryAsync(ct);
        }

        if (withChapter)
        {
            await using var chCmd = new NpgsqlCommand(
                """
                INSERT INTO chapters
                    (id, edition_id, chapter_number, slug, title, html, plain_text, created_at, updated_at)
                VALUES (@cid, @eid, 1, @slug, 'C1', '<p>x</p>', 'x', now(), now());
                """, conn);
            chCmd.Parameters.AddWithValue("cid", chapterId);
            chCmd.Parameters.AddWithValue("eid", editionId);
            chCmd.Parameters.AddWithValue("slug", "ch-" + chapterId.ToString("N")[..8]);
            await chCmd.ExecuteNonQueryAsync(ct);
        }
    }

    private static async Task CleanupAsync(NpgsqlConnection conn, List<Guid> editionIds, string run, CancellationToken ct)
    {
        if (editionIds.Count == 0)
            return;

        // chapters cascade off editions; deleting editions then their now-orphan works is enough.
        await using var cmd = new NpgsqlCommand(
            """
            DELETE FROM editions WHERE id = ANY(@ids);
            DELETE FROM works w WHERE NOT EXISTS (SELECT 1 FROM editions e WHERE e.work_id = w.id)
                                  AND w.slug LIKE @workpat;
            """, conn);
        cmd.Parameters.AddWithValue("ids", editionIds.ToArray());
        cmd.Parameters.AddWithValue("workpat", run + "-work-%");
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task<Guid?> ScalarGuidAsync(NpgsqlConnection conn, string sql, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        var v = await cmd.ExecuteScalarAsync(ct);
        return v is Guid g ? g : null;
    }

    /// <summary>Builds a 1536-dim vector with two non-zero leading dims (the rest 0).</summary>
    private static float[] Unit(float d0, float d1)
    {
        var v = new float[Dim];
        v[0] = d0;
        v[1] = d1;
        return v;
    }

    private static string FormatVector(float[] v) =>
        "[" + string.Join(",", v.Select(x => x.ToString("R", CultureInfo.InvariantCulture))) + "]";
}
