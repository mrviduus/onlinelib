using Application.Books;
using OnlineLib.UnitTests.TestData;

namespace OnlineLib.UnitTests;

public class BookServiceTests
{
    [Fact]
    public async Task GetBooksAsync_ReturnsAllPublishedBooks()
    {
        await using var db = await TestDbContextFactory.CreateWithBooksAsync();
        var service = new BookService(db);

        var result = await service.GetBooksAsync(BookTestData.GeneralSiteId, 0, 10, null, CancellationToken.None);

        Assert.Equal(2, result.Total);
        Assert.Equal(2, result.Items.Count);
    }

    [Fact]
    public async Task GetBooksAsync_FiltersByLanguage()
    {
        await using var db = await TestDbContextFactory.CreateWithBooksAsync();
        var service = new BookService(db);

        var result = await service.GetBooksAsync(BookTestData.GeneralSiteId, 0, 10, "en", CancellationToken.None);

        Assert.Equal(2, result.Total);
        Assert.All(result.Items, b => Assert.Equal("en", b.Language));
    }

    [Fact]
    public async Task GetBooksAsync_ReturnsEmptyForUnknownLanguage()
    {
        await using var db = await TestDbContextFactory.CreateWithBooksAsync();
        var service = new BookService(db);

        var result = await service.GetBooksAsync(BookTestData.GeneralSiteId, 0, 10, "fr", CancellationToken.None);

        Assert.Equal(0, result.Total);
        Assert.Empty(result.Items);
    }

    [Fact]
    public async Task GetBooksAsync_SupportsPagination()
    {
        await using var db = await TestDbContextFactory.CreateWithBooksAsync();
        var service = new BookService(db);

        var result = await service.GetBooksAsync(BookTestData.GeneralSiteId, 0, 1, null, CancellationToken.None);

        Assert.Equal(2, result.Total);
        Assert.Single(result.Items);
    }

    [Fact]
    public async Task GetBookAsync_ReturnsBookBySlug()
    {
        await using var db = await TestDbContextFactory.CreateWithBooksAsync();
        var service = new BookService(db);

        var book = await service.GetBookAsync(BookTestData.GeneralSiteId, "great-gatsby", CancellationToken.None);

        Assert.NotNull(book);
        Assert.Equal("The Great Gatsby", book.Title);
        Assert.Equal("great-gatsby", book.Slug);
        Assert.Equal(2, book.Chapters.Count);
    }

    [Fact]
    public async Task GetBookAsync_ReturnsNullForUnknownSlug()
    {
        await using var db = await TestDbContextFactory.CreateWithBooksAsync();
        var service = new BookService(db);

        var book = await service.GetBookAsync(BookTestData.GeneralSiteId, "unknown-book", CancellationToken.None);

        Assert.Null(book);
    }

    [Fact]
    public async Task GetBookAsync_IncludesChaptersInOrder()
    {
        await using var db = await TestDbContextFactory.CreateWithBooksAsync();
        var service = new BookService(db);

        var book = await service.GetBookAsync(BookTestData.GeneralSiteId, "frankenstein", CancellationToken.None);

        Assert.NotNull(book);
        Assert.Equal(3, book.Chapters.Count);
        Assert.Equal(1, book.Chapters[0].ChapterNumber);
        Assert.Equal(2, book.Chapters[1].ChapterNumber);
        Assert.Equal(3, book.Chapters[2].ChapterNumber);
    }

    [Fact]
    public async Task GetChapterAsync_ReturnsChapterBySlug()
    {
        await using var db = await TestDbContextFactory.CreateWithBooksAsync();
        var service = new BookService(db);

        var chapter = await service.GetChapterAsync(BookTestData.GeneralSiteId, "great-gatsby", "chapter-1", CancellationToken.None);

        Assert.NotNull(chapter);
        Assert.Equal("Chapter 1", chapter.Title);
        Assert.Contains("my younger and more vulnerable years", chapter.Html);
    }

    [Fact]
    public async Task GetChapterAsync_IncludesNavigation()
    {
        await using var db = await TestDbContextFactory.CreateWithBooksAsync();
        var service = new BookService(db);

        var chapter = await service.GetChapterAsync(BookTestData.GeneralSiteId, "great-gatsby", "chapter-1", CancellationToken.None);

        Assert.NotNull(chapter);
        Assert.Null(chapter.Prev);
        Assert.NotNull(chapter.Next);
        Assert.Equal("chapter-2", chapter.Next.Slug);
    }

    [Fact]
    public async Task GetChapterAsync_ReturnsNullForUnknownChapter()
    {
        await using var db = await TestDbContextFactory.CreateWithBooksAsync();
        var service = new BookService(db);

        var chapter = await service.GetChapterAsync(BookTestData.GeneralSiteId, "great-gatsby", "unknown-chapter", CancellationToken.None);

        Assert.Null(chapter);
    }
}
