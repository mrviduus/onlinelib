using Application.Common.Interfaces;
using Application.Export;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace TextStack.UnitTests;

/// <summary>
/// PDF-highlights S-a safety net. A chapterless (page-anchored) PDF highlight has a null
/// <see cref="Highlight.UserChapterId"/>. EPUB export walks the book's <b>chapters</b> and never
/// reads the Highlights set, so a chapterless highlight in the DB must not affect — let alone
/// break — a user-book export. This pins that structural guarantee: seed a Ready user book with
/// a real chapter plus a chapterless highlight and assert the export still produces a stream.
/// (Include(...) no-ops over the non-EF test provider, so navigations are set in-memory.)
/// </summary>
public class EpubExportChapterlessHighlightTests
{
    private static Mock<DbSet<T>> FakeSet<T>(List<T> data) where T : class
    {
        var q = new TestAsyncEnumerable<T>(data);
        var set = new Mock<DbSet<T>>();
        var iq = set.As<IQueryable<T>>();
        iq.Setup(m => m.Provider).Returns(((IQueryable<T>)q).Provider);
        iq.Setup(m => m.Expression).Returns(((IQueryable<T>)q).Expression);
        iq.Setup(m => m.ElementType).Returns(((IQueryable<T>)q).ElementType);
        iq.Setup(m => m.GetEnumerator()).Returns(() => data.GetEnumerator());
        set.As<IAsyncEnumerable<T>>()
            .Setup(m => m.GetAsyncEnumerator(It.IsAny<CancellationToken>()))
            .Returns(() => new TestAsyncEnumerator<T>(data.GetEnumerator()));
        return set;
    }

    [Fact]
    public async Task ExportUserBookAsync_BookHasChapterlessPdfHighlight_ExportsWithoutThrowing()
    {
        var userId = Guid.NewGuid();
        var bookId = Guid.NewGuid();

        var chapter = new UserChapter
        {
            Id = Guid.NewGuid(),
            UserBookId = bookId,
            ChapterNumber = 1,
            Title = "Page 1",
            Html = "<p>Real fluency is built by reading real books.</p>",
            PlainText = "Real fluency is built by reading real books.",
        };
        var book = new UserBook
        {
            Id = bookId,
            UserId = userId,
            Title = "PDF Book",
            Slug = "pdf-book",
            Language = "en",
            CoverPath = null, // no storage read
            Status = UserBookStatus.Ready,
            Chapters = [chapter],
        };

        // A chapterless, page-anchored PDF highlight — the thing export must ignore, not choke on.
        var pdfHighlight = new Highlight
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            SiteId = Guid.NewGuid(),
            UserBookId = bookId,
            UserChapterId = null,
            AnchorJson = """{"v":1,"kind":"pdf","page":1,"rects":[{"x":0.1,"y":0.2,"w":0.3,"h":0.02}],"exact":"real books"}""",
            Color = "yellow",
            SelectedText = "real books",
        };

        var db = new Mock<IAppDbContext>();
        db.Setup(x => x.UserBooks).Returns(FakeSet(new List<UserBook> { book }).Object);
        db.Setup(x => x.Highlights).Returns(FakeSet(new List<Highlight> { pdfHighlight }).Object);

        var storage = new Mock<IFileStorageService>();

        var svc = new EpubExportService(db.Object, storage.Object);

        var result = await svc.ExportUserBookAsync(userId, bookId, TestContext.Current.CancellationToken);

        Assert.NotNull(result);
        Assert.Equal("pdf-book.epub", result.Value.FileName);
        Assert.True(result.Value.Stream.Length > 0);
        // Storage never touched (no cover) — export walked chapters only, not the highlight.
        storage.Verify(s => s.GetFileAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
