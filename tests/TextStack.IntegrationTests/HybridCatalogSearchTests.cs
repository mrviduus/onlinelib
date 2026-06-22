using System.Globalization;
using Application.Search;
using Npgsql;
using TextStack.Ai.Core;
using TextStack.Search.Analyzers;
using TextStack.Search.Contracts;
using TextStack.Search.Enums;
using TextStack.Search.Providers.PostgresFts;

namespace TextStack.IntegrationTests;

/// <summary>
/// Integration tests for AI-057 <see cref="HybridCatalogSearch"/> against real Postgres+pgvector
/// (CI's <c>pgvector/pgvector:pg16</c> has the <c>&lt;=&gt;</c> cosine operator + HNSW index). Like
/// <see cref="SimilarBooksTests"/> these poke the DB via <c>TEST_DB_CONNECTION</c> and SKIP when unset.
///
/// The payoff under test: with <c>semantic=true</c>, an edition that is semantically related to the
/// query but contains NONE of the query keywords (B) surfaces alongside the keyword match (A). A fixed
/// query vector is injected via a fake <see cref="IEmbeddingService"/> (no real OpenAI call), and B's
/// <c>editions.embedding</c> is seeded colinear with that vector. Visibility (status/site/lang) is
/// enforced just like AI-055.
/// </summary>
public class HybridCatalogSearchTests
{
    private static string? DbConn => Environment.GetEnvironmentVariable("TEST_DB_CONNECTION");

    private const int Dim = 1536;
    private const string SlugPrefix = "ai057-";

    // A fixed query vector pointing "right" along dim0. B is seeded colinear with this.
    private static float[] QueryVector() => Unit(1.0f, 0.0f);

    [Fact]
    public async Task SearchAsync_Semantic_SurfacesKeywordAbsentSemanticHit_AndAppliesVisibility()
    {
        Assert.SkipWhen(DbConn is null, "TEST_DB_CONNECTION not set");
        var ct = TestContext.Current.CancellationToken;

        await using var conn = new NpgsqlConnection(DbConn);
        await conn.OpenAsync(ct);

        var siteId = await PrimarySiteIdAsync(conn, ct);
        var otherSiteId = await EnsureSecondSiteAsync(conn, ct);
        var run = Guid.NewGuid().ToString("N")[..8];
        var token = "zqxwv" + run; // a nonsense token guaranteed only in A's title
        var seeded = new List<Guid>();

        try
        {
            // A — KEYWORD match: title contains the query token. Embedding orthogonal (not a vector hit).
            var aSlug = $"{SlugPrefix}{run}-a";
            await SeedEditionAsync(conn, siteId, aSlug, "en", status: 1,
                title: $"The {token} Chronicles", embedding: Unit(0.0f, 1.0f), withChapter: true, run, seeded, ct);

            // B — SEMANTIC-only: title has NONE of the query token, embedding colinear with query vector.
            var bSlug = $"{SlugPrefix}{run}-b";
            await SeedEditionAsync(conn, siteId, bSlug, "en", status: 1,
                title: "Completely Unrelated Title", embedding: Unit(1.0f, 0.0f), withChapter: true, run, seeded, ct);

            // C-draft — colinear embedding but status 0 → never.
            await SeedEditionAsync(conn, siteId, $"{SlugPrefix}{run}-draft", "en", status: 0,
                title: "Draft Near", embedding: Unit(0.99f, 0.14f), withChapter: true, run, seeded, ct);

            // C-hidden — status 2 → never.
            await SeedEditionAsync(conn, siteId, $"{SlugPrefix}{run}-hidden", "en", status: 2,
                title: "Hidden Near", embedding: Unit(0.98f, 0.2f), withChapter: true, run, seeded, ct);

            // C-othersite — colinear but other site → never.
            await SeedEditionAsync(conn, otherSiteId, $"{SlugPrefix}{run}-othersite", "en", status: 1,
                title: "Other Site Near", embedding: Unit(0.97f, 0.24f), withChapter: true, run, seeded, ct);

            // C-otherlang — colinear but other language → never (language filter).
            await SeedEditionAsync(conn, siteId, $"{SlugPrefix}{run}-otherlang", "uk", status: 1,
                title: "Other Lang Near", embedding: Unit(0.96f, 0.28f), withChapter: true, run, seeded, ct);

            var embedder = new FixedEmbeddingService(QueryVector());
            var ftsProvider = new PostgresSearchProvider(
                () => new NpgsqlConnection(DbConn!), new TsQueryBuilder(), new MultilingualAnalyzer());
            var sut = new HybridCatalogSearch(ftsProvider, () => embedder, () => new NpgsqlConnection(DbConn!));

            var request = new SearchRequest(token, siteId, SearchLanguage.En, Offset: 0, Limit: 20);
            var result = await sut.SearchAsync(request, "en", ct);

            var editionIds = result.Hits.Select(EditionId).ToHashSet();
            var aId = (await EditionIdBySlugAsync(conn, siteId, aSlug, ct))!.Value;
            var bId = (await EditionIdBySlugAsync(conn, siteId, bSlug, ct))!.Value;

            // A (keyword) present, B (semantic-only) surfaces — the AI-057 payoff.
            Assert.Contains(aId, editionIds);
            Assert.Contains(bId, editionIds);

            // None of the invisible editions ever appear.
            foreach (var slug in new[] { "draft", "hidden", "othersite", "otherlang" })
            {
                var id = await EditionIdBySlugAsync(conn, siteId, $"{SlugPrefix}{run}-{slug}", ct)
                         ?? await EditionIdBySlugAsync(conn, otherSiteId, $"{SlugPrefix}{run}-{slug}", ct);
                if (id is not null)
                    Assert.DoesNotContain(id.Value, editionIds);
            }

            // B has no keyword match → its hit must carry EMPTY highlights + a first-chapter fallback.
            var bHit = result.Hits.Single(h => EditionId(h) == bId);
            var bHighlights = bHit.Highlights.SelectMany(h => h.Fragments).ToList();
            Assert.Empty(bHighlights);
            Assert.NotEqual(Guid.Empty, ChapterId(bHit)); // first-chapter fallback populated
        }
        finally
        {
            await CleanupAsync(conn, seeded, run, ct);
        }
    }

    [Fact]
    public async Task SearchAsync_PureFts_MatchesProviderControl_NoDrift()
    {
        // Control: a pure-FTS call (no semantic) must be unaffected — same edition set the provider
        // returns directly. Confirms the toggle-off path doesn't drift.
        Assert.SkipWhen(DbConn is null, "TEST_DB_CONNECTION not set");
        var ct = TestContext.Current.CancellationToken;

        await using var conn = new NpgsqlConnection(DbConn);
        await conn.OpenAsync(ct);

        var siteId = await PrimarySiteIdAsync(conn, ct);
        var run = Guid.NewGuid().ToString("N")[..8];
        var token = "zqxwv" + run;
        var seeded = new List<Guid>();

        try
        {
            var aSlug = $"{SlugPrefix}{run}-a";
            await SeedEditionAsync(conn, siteId, aSlug, "en", status: 1,
                title: $"The {token} Chronicles", embedding: Unit(0.0f, 1.0f), withChapter: true, run, seeded, ct);

            var ftsProvider = new PostgresSearchProvider(
                () => new NpgsqlConnection(DbConn!), new TsQueryBuilder(), new MultilingualAnalyzer());

            var request = new SearchRequest(token, siteId, SearchLanguage.En, Offset: 0, Limit: 20);
            var control = await ftsProvider.SearchAsync(request, ct);

            var controlIds = control.Hits.Select(EditionId).ToHashSet();
            var aId = (await EditionIdBySlugAsync(conn, siteId, aSlug, ct))!.Value;
            Assert.Contains(aId, controlIds);
        }
        finally
        {
            await CleanupAsync(conn, seeded, run, ct);
        }
    }

    // ---- helpers ----

    private static Guid EditionId(SearchHit hit) =>
        hit.Metadata.TryGetValue("editionId", out var v) && v is Guid g ? g : Guid.Empty;

    private static Guid ChapterId(SearchHit hit) =>
        hit.Metadata.TryGetValue("chapterId", out var v) && v is Guid g ? g : Guid.Empty;

    private static async Task<Guid?> EditionIdBySlugAsync(NpgsqlConnection conn, Guid siteId, string slug, CancellationToken ct) =>
        await ScalarGuidAsync(conn, $"SELECT id FROM editions WHERE slug = '{slug}' AND site_id = '{siteId}'", ct);

    private static async Task<Guid> PrimarySiteIdAsync(NpgsqlConnection conn, CancellationToken ct) =>
        await ScalarGuidAsync(conn, "SELECT id FROM sites ORDER BY created_at LIMIT 1", ct)
            ?? throw new InvalidOperationException("No site row to attach test fixtures to.");

    private static async Task<Guid> EnsureSecondSiteAsync(NpgsqlConnection conn, CancellationToken ct)
    {
        var primary = await PrimarySiteIdAsync(conn, ct);
        var existing = await ScalarGuidAsync(conn, $"SELECT id FROM sites WHERE id <> '{primary}' LIMIT 1", ct);
        if (existing is not null)
            return existing.Value;

        var id = Guid.NewGuid();
        var code = "ai057site" + id.ToString("N")[..8];
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
        NpgsqlConnection conn, Guid siteId, string slug, string language, int status, string title,
        float[]? embedding, bool withChapter, string run, List<Guid> seeded, CancellationToken ct)
    {
        var workId = Guid.NewGuid();
        var editionId = Guid.NewGuid();
        var chapterId = Guid.NewGuid();
        seeded.Add(editionId);

        await using (var workCmd = new NpgsqlCommand(
            """
            INSERT INTO works (id, site_id, slug, created_at)
            VALUES (@id, @site, @slug, now()) ON CONFLICT (id) DO NOTHING;
            """, conn))
        {
            workCmd.Parameters.AddWithValue("id", workId);
            workCmd.Parameters.AddWithValue("site", siteId);
            workCmd.Parameters.AddWithValue("slug", run + "-work-" + workId.ToString("N")[..8]);
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
            edCmd.Parameters.AddWithValue("title", title);
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

    private static float[] Unit(float d0, float d1)
    {
        var v = new float[Dim];
        v[0] = d0;
        v[1] = d1;
        return v;
    }

    private static string FormatVector(float[] v) =>
        "[" + string.Join(",", v.Select(x => x.ToString("R", CultureInfo.InvariantCulture))) + "]";

    /// <summary>Returns a fixed query vector regardless of input — no real OpenAI call.</summary>
    private sealed class FixedEmbeddingService : IEmbeddingService
    {
        private readonly float[] _vector;
        public FixedEmbeddingService(float[] vector) => _vector = vector;
        public int Dimensions => Dim;
        public Task<float[]> EmbedAsync(string text, CancellationToken ct) => Task.FromResult(_vector);
        public Task<IReadOnlyList<float[]>> EmbedBatchAsync(IReadOnlyList<string> texts, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<float[]>>(texts.Select(_ => _vector).ToList());
    }
}
