using Microsoft.EntityFrameworkCore;

namespace OnlineLib.UnitTests.TestData;

public static class TestDbContextFactory
{
    public static TestDbContext Create()
    {
        var options = new DbContextOptionsBuilder<TestDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var context = new TestDbContext(options);
        context.Database.EnsureCreated();
        return context;
    }

    public static async Task<TestDbContext> CreateWithBooksAsync()
    {
        var context = Create();

        var site = BookTestData.CreateFictionSite();
        context.Sites.Add(site);

        var (work1, edition1, chapters1) = BookTestData.CreateBook1();
        context.Works.Add(work1);
        context.Editions.Add(edition1);
        context.Chapters.AddRange(chapters1);

        var (work2, edition2, chapters2) = BookTestData.CreateBook2();
        context.Works.Add(work2);
        context.Editions.Add(edition2);
        context.Chapters.AddRange(chapters2);

        await context.SaveChangesAsync();
        return context;
    }
}
