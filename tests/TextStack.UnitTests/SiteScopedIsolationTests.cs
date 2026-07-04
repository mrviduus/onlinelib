using Application.Common.Interfaces;
using Domain.Entities;
using Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace TextStack.UnitTests;

/// <summary>
/// R1b site isolation. The full AppDbContext model only builds on Npgsql (tsvector,
/// pgvector, jsonb), so we exercise the R1b mechanism — the real
/// <see cref="ISiteScoped"/> interface, the real <see cref="SiteScopedStamp.Apply"/>
/// production stamping method, and the identical per-instance query-filter lambda —
/// against a real Sqlite provider on a minimal context.
///
/// Proves: (a) filtered reads see only the context's site, (b) IgnoreQueryFilters
/// bypasses the filter, (c) inserting an ISiteScoped row with no SiteId write-stamps
/// the current site (and an explicit SiteId is respected).
/// </summary>
public class SiteScopedIsolationTests
{
    private static readonly Guid SiteA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid SiteB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    // Minimal ISiteScoped entity — uses the real Domain interface, no Postgres types.
    private sealed class Widget : ISiteScoped
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid SiteId { get; set; }
        public string Name { get; set; } = "";
    }

    // Minimal context mirroring AppDbContext's R1b wiring: an instance-referenced
    // site query filter + SaveChanges delegating to the real SiteScopedStamp.Apply.
    private sealed class TestContext : DbContext
    {
        private readonly ICurrentSite _currentSite;
        public TestContext(DbContextOptions<TestContext> options, ICurrentSite currentSite) : base(options)
            => _currentSite = currentSite;

        public DbSet<Widget> Widgets => Set<Widget>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
            => modelBuilder.Entity<Widget>().HasQueryFilter(x => x.SiteId == _currentSite.Id);

        public override int SaveChanges(bool acceptAllChangesOnSuccess)
        {
            SiteScopedStamp.Apply(ChangeTracker, _currentSite.Id);
            return base.SaveChanges(acceptAllChangesOnSuccess);
        }
    }

    private static (SqliteConnection conn, DbContextOptions<TestContext> options) NewDb()
    {
        var conn = new SqliteConnection("Filename=:memory:");
        conn.Open();
        var options = new DbContextOptionsBuilder<TestContext>().UseSqlite(conn).Options;
        return (conn, options);
    }

    private static TestContext Ctx(DbContextOptions<TestContext> options, Guid siteId)
        => new(options, new CurrentSite(siteId));

    [Fact]
    public void QueryFilter_TwoSitesOneDb_SeesOnlyCurrentSite()
    {
        var (conn, options) = NewDb();
        try
        {
            using (var init = Ctx(options, SiteA)) init.Database.EnsureCreated();

            // Seed both sites through their own contexts (write-stamped, no explicit SiteId).
            using (var a = Ctx(options, SiteA))
            {
                a.Widgets.Add(new Widget { Name = "a1" });
                a.Widgets.Add(new Widget { Name = "a2" });
                a.SaveChanges();
            }
            using (var b = Ctx(options, SiteB))
            {
                b.Widgets.Add(new Widget { Name = "b1" });
                b.SaveChanges();
            }

            // (a) filtered read from a fresh site-A context sees only site A.
            using var queryA = Ctx(options, SiteA);
            var aRows = queryA.Widgets.AsNoTracking().ToList();
            Assert.Equal(2, aRows.Count);
            Assert.All(aRows, w => Assert.Equal(SiteA, w.SiteId));

            // A fresh site-B context (same DB, same model) sees only site B — proves the
            // filter re-evaluates per instance rather than baking one site into the model.
            using var queryB = Ctx(options, SiteB);
            var bRows = queryB.Widgets.AsNoTracking().ToList();
            Assert.Single(bRows);
            Assert.Equal(SiteB, bRows[0].SiteId);

            // (b) IgnoreQueryFilters sees everything.
            Assert.Equal(3, queryA.Widgets.AsNoTracking().IgnoreQueryFilters().Count());
        }
        finally { conn.Dispose(); }
    }

    [Fact]
    public void WriteStamp_InsertWithoutSiteId_GetsCurrentSite()
    {
        var (conn, options) = NewDb();
        try
        {
            using (var init = Ctx(options, SiteA)) init.Database.EnsureCreated();

            using var a = Ctx(options, SiteA);
            var w = new Widget { Name = "no-site" };
            a.Widgets.Add(w);
            a.SaveChanges();

            // (c) write-stamping filled the empty SiteId with the current site.
            Assert.Equal(SiteA, w.SiteId);
        }
        finally { conn.Dispose(); }
    }

    [Fact]
    public void WriteStamp_InsertWithExplicitSiteId_IsRespected()
    {
        var (conn, options) = NewDb();
        try
        {
            using (var init = Ctx(options, SiteA)) init.Database.EnsureCreated();

            // Insert an explicit foreign SiteId through a site-A context: stamping must
            // NOT overwrite it, and the row is then invisible to site-A's filter.
            using (var a = Ctx(options, SiteA))
            {
                a.Widgets.Add(new Widget { Name = "explicit-b", SiteId = SiteB });
                a.SaveChanges();
            }

            using var queryA = Ctx(options, SiteA);
            Assert.Empty(queryA.Widgets.AsNoTracking().ToList());
            var all = queryA.Widgets.AsNoTracking().IgnoreQueryFilters().ToList();
            Assert.Single(all);
            Assert.Equal(SiteB, all[0].SiteId);
        }
        finally { conn.Dispose(); }
    }
}
