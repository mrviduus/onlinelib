using Domain.Entities;
using Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace OnlineLib.IntegrationTests;

public class TestWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _tempPath;
    private readonly List<Guid> _createdJobIds = [];

    public static readonly Guid GeneralSiteId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    public static readonly Guid TestAuthorId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    public static readonly Guid TestGenreId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    public TestWebApplicationFactory()
    {
        _tempPath = Path.Combine(Path.GetTempPath(), "onlinelib-tests", Guid.NewGuid().ToString());
        Directory.CreateDirectory(_tempPath);

        // Set env var before host starts
        Environment.SetEnvironmentVariable("Storage__RootPath", _tempPath);
    }

    /// <summary>
    /// Track created job for cleanup
    /// </summary>
    public void TrackJob(Guid jobId) => _createdJobIds.Add(jobId);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Use existing Docker PostgreSQL - just seed test data
        builder.ConfigureServices(services =>
        {
            var sp = services.BuildServiceProvider();
            using var scope = sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            SeedTestData(db);
        });
    }

    private static void CleanupOldTestData(AppDbContext db)
    {
        try
        {
            // Find test editions by title pattern
            var testEditions = db.Editions
                .Where(e => e.Title.StartsWith("Test ") || e.Title.StartsWith("Duplicate Test Book"))
                .Select(e => e.Id)
                .ToList();

            if (testEditions.Count == 0) return;

            // Delete in order respecting FK constraints
            var jobs = db.IngestionJobs.Where(j => testEditions.Contains(j.EditionId)).ToList();
            var bookFiles = db.BookFiles.Where(bf => testEditions.Contains(bf.EditionId)).ToList();
            var chapters = db.Chapters.Where(c => testEditions.Contains(c.EditionId)).ToList();
            var editions = db.Editions.Where(e => testEditions.Contains(e.Id)).ToList();
            var workIds = editions.Select(e => e.WorkId).Distinct().ToList();

            db.IngestionJobs.RemoveRange(jobs);
            db.BookFiles.RemoveRange(bookFiles);
            db.Chapters.RemoveRange(chapters);
            db.Editions.RemoveRange(editions);
            db.SaveChanges();

            // Clean orphan works
            var orphanWorks = db.Works
                .Where(w => workIds.Contains(w.Id) && !db.Editions.Any(e => e.WorkId == w.Id))
                .ToList();
            db.Works.RemoveRange(orphanWorks);
            db.SaveChanges();
        }
        catch { /* Ignore cleanup errors */ }
    }

    private static void SeedTestData(AppDbContext db)
    {
        // Clean up leftover test data from previous runs
        CleanupOldTestData(db);

        // Use try-catch to handle parallel test execution race conditions
        try
        {
            if (!db.Sites.Any(s => s.Id == GeneralSiteId))
            {
                db.Sites.Add(new Site
                {
                    Id = GeneralSiteId,
                    Code = "general",
                    PrimaryDomain = "general.localhost",
                    DefaultLanguage = "en",
                    CreatedAt = DateTimeOffset.UtcNow,
                    UpdatedAt = DateTimeOffset.UtcNow
                });
                db.SaveChanges();
            }
        }
        catch { db.ChangeTracker.Clear(); }

        try
        {
            if (!db.Authors.Any(a => a.Id == TestAuthorId))
            {
                db.Authors.Add(new Author
                {
                    Id = TestAuthorId,
                    SiteId = GeneralSiteId,
                    Slug = "test-author",
                    Name = "Test Author",
                    CreatedAt = DateTimeOffset.UtcNow,
                    UpdatedAt = DateTimeOffset.UtcNow
                });
                db.SaveChanges();
            }
        }
        catch { db.ChangeTracker.Clear(); }

        try
        {
            if (!db.Genres.Any(g => g.Id == TestGenreId))
            {
                db.Genres.Add(new Genre
                {
                    Id = TestGenreId,
                    SiteId = GeneralSiteId,
                    Slug = "test-genre",
                    Name = "Test Genre",
                    CreatedAt = DateTimeOffset.UtcNow,
                    UpdatedAt = DateTimeOffset.UtcNow
                });
                db.SaveChanges();
            }
        }
        catch { db.ChangeTracker.Clear(); }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            // Clean up test data from DB
            CleanupTestData();

            if (Directory.Exists(_tempPath))
            {
                try { Directory.Delete(_tempPath, true); } catch { }
            }
        }
        base.Dispose(disposing);
    }

    private void CleanupTestData()
    {
        if (_createdJobIds.Count == 0) return;

        try
        {
            using var scope = Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            // Delete in order: jobs -> book_files -> chapters -> editions -> works
            var jobs = db.IngestionJobs.Where(j => _createdJobIds.Contains(j.Id)).ToList();
            var editionIds = jobs.Select(j => j.EditionId).Distinct().ToList();
            var workIds = jobs.Where(j => j.WorkId.HasValue).Select(j => j.WorkId!.Value).Distinct().ToList();
            var bookFileIds = jobs.Select(j => j.BookFileId).Distinct().ToList();

            db.IngestionJobs.RemoveRange(jobs);

            var bookFiles = db.BookFiles.Where(bf => bookFileIds.Contains(bf.Id)).ToList();
            db.BookFiles.RemoveRange(bookFiles);

            var chapters = db.Chapters.Where(c => editionIds.Contains(c.EditionId)).ToList();
            db.Chapters.RemoveRange(chapters);

            var editions = db.Editions.Where(e => editionIds.Contains(e.Id)).ToList();
            db.Editions.RemoveRange(editions);

            var works = db.Works.Where(w => workIds.Contains(w.Id)).ToList();
            db.Works.RemoveRange(works);

            db.SaveChanges();
        }
        catch
        {
            // Ignore cleanup errors
        }
    }
}
