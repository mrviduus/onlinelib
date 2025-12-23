using Application.Books;
using OnlineLib.UnitTests.TestData;

namespace OnlineLib.UnitTests;

public class BookServiceTests
{
    [Fact]
    public async Task GetBooksAsync_ReturnsPublishedBooks()
    {
        await using var db = await TestDbContextFactory.CreateWithBooksAsync();
        var service = new BookService(db);

        var result = await service.GetBooksAsync(BookTestData.GeneralSiteId, 0, 10, null, CancellationToken.None);

        Assert.Equal(2, result.Total);
        Assert.Equal(2, result.Items.Count);
    }

    [Fact]
    public async Task GetBookAsync_ReturnsBookWithChapters()
    {
        await using var db = await TestDbContextFactory.CreateWithBooksAsync();
        var service = new BookService(db);

        var book = await service.GetBookAsync(BookTestData.GeneralSiteId, "great-gatsby", "en", CancellationToken.None);

        Assert.NotNull(book);
        Assert.Equal("The Great Gatsby", book.Title);
        Assert.Equal(2, book.Chapters.Count);
    }

    [Fact]
    public async Task GetChapterAsync_IncludesNavigation()
    {
        await using var db = await TestDbContextFactory.CreateWithBooksAsync();
        var service = new BookService(db);

        var chapter = await service.GetChapterAsync(BookTestData.GeneralSiteId, "great-gatsby", "chapter-1", "en", CancellationToken.None);

        Assert.NotNull(chapter);
        Assert.Null(chapter.Prev);
        Assert.NotNull(chapter.Next);
        Assert.Equal("chapter-2", chapter.Next.Slug);
    }
}
