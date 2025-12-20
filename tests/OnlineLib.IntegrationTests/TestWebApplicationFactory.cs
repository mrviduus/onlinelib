using Domain.Entities;
using Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace OnlineLib.IntegrationTests;

public class TestWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _tempPath;

    public static readonly Guid GeneralSiteId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    public TestWebApplicationFactory()
    {
        _tempPath = Path.Combine(Path.GetTempPath(), "onlinelib-tests", Guid.NewGuid().ToString());
        Directory.CreateDirectory(_tempPath);

        // Set env var before host starts
        Environment.SetEnvironmentVariable("Storage__RootPath", _tempPath);
    }

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

    private static void SeedTestData(AppDbContext db)
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

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            if (Directory.Exists(_tempPath))
            {
                try { Directory.Delete(_tempPath, true); } catch { }
            }
        }
    }
}
