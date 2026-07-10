using Application.Common.Interfaces;
using Application.UserBooks;
using Contracts.UserBooks;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace TextStack.UnitTests;

// fix/pdf-reader-chrome: PDFs opened in "Original layout" (ADR-012) are chapterless, so a
// "bookmark this page" must persist with ChapterId=null and a page Locator ("page:N").
// Chapter-based bookmarks (reflow/EPUB) must keep working, and owner-scoping (user_id/
// user_book_id) is unaffected. List<T>-backed Moq sets (production AppDbContext can't load
// on EF InMemory — see UserBookClipServiceTests); nav props are wired by hand.
public class UserBookBookmarkServiceTests
{
    private sealed class Harness
    {
        public List<UserBook> UserBooks { get; } = [];
        public List<UserChapter> UserChapters { get; } = [];
        public List<UserBookBookmark> Bookmarks { get; } = [];
        public UserBookService Service { get; }

        public Harness()
        {
            var db = new Mock<IAppDbContext>();
            db.Setup(x => x.UserBooks).Returns(() => FakeSet(UserBooks).Object);
            db.Setup(x => x.UserChapters).Returns(() => FakeSet(UserChapters).Object);
            db.Setup(x => x.UserBookBookmarks).Returns(() => FakeSet(Bookmarks).Object);
            // Real EF resolves the UserBook/Chapter joins in SQL; the List-backed fake can't,
            // so wire the nav props here (on save) to match what a projection would see.
            db.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
                .Callback(WireNavs)
                .ReturnsAsync(0);

            Service = new UserBookService(db.Object, new Mock<IFileStorageService>().Object);
        }

        public UserBook SeedBook(Guid userId)
        {
            var b = new UserBook
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Title = "T",
                Slug = "t",
                Language = "en",
                Status = UserBookStatus.Ready,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            UserBooks.Add(b);
            return b;
        }

        private void WireNavs()
        {
            foreach (var b in Bookmarks)
            {
                b.UserBook ??= UserBooks.FirstOrDefault(x => x.Id == b.UserBookId)!;
                if (b.ChapterId is { } cid)
                    b.Chapter ??= UserChapters.FirstOrDefault(x => x.Id == cid);
            }
        }

        public UserChapter SeedChapter(UserBook book, string slug)
        {
            var c = new UserChapter
            {
                Id = Guid.NewGuid(),
                UserBookId = book.Id,
                UserBook = book,
                ChapterNumber = 1,
                Slug = slug,
                Title = "Ch",
                Html = "<p>x</p>",
                PlainText = "x"
            };
            UserChapters.Add(c);
            return c;
        }
    }

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
        set.Setup(m => m.Add(It.IsAny<T>())).Callback<T>(e => data.Add(e));
        set.Setup(m => m.Remove(It.IsAny<T>())).Callback<T>(e => data.Remove(e));
        return set;
    }

    // A page bookmark on a chapterless PDF: no ChapterId, anchored on Locator "page:N".
    [Fact]
    public async Task CreateBookmarkAsync_PageBookmarkNullChapter_PersistsWithNullChapter()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        var book = h.SeedBook(userId);

        var req = new CreateUserBookBookmarkRequest(ChapterId: null, Locator: "page:17", Title: "Page 17");
        var (dto, error) = await h.Service.CreateBookmarkAsync(userId, book.Id, req, CancellationToken.None);

        Assert.Null(error);
        Assert.NotNull(dto);
        Assert.Null(dto!.ChapterId);
        Assert.Null(dto.ChapterSlug);
        Assert.Equal("page:17", dto.Locator);
        Assert.Equal("Page 17", dto.Title);

        var stored = Assert.Single(h.Bookmarks);
        Assert.Null(stored.ChapterId);
        Assert.Equal("page:17", stored.Locator);
    }

    // Round-trip: a page bookmark must list back with a null chapter (no Chapter.Slug deref).
    [Fact]
    public async Task GetBookmarksAsync_PageBookmark_ListsWithNullChapterSlug()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        var book = h.SeedBook(userId);

        await h.Service.CreateBookmarkAsync(
            userId, book.Id, new CreateUserBookBookmarkRequest(null, "page:17", "Page 17"), CancellationToken.None);

        var list = await h.Service.GetBookmarksAsync(userId, book.Id, CancellationToken.None);

        var dto = Assert.Single(list);
        Assert.Null(dto.ChapterId);
        Assert.Null(dto.ChapterSlug);
        Assert.Equal("page:17", dto.Locator);
        Assert.Equal("Page 17", dto.Title);
    }

    // Chapter-based bookmark (reflow/EPUB) keeps working: ChapterId resolves, slug flows through.
    [Fact]
    public async Task CreateBookmarkAsync_ChapterBookmark_PersistsWithChapterSlug()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        var book = h.SeedBook(userId);
        var chapter = h.SeedChapter(book, "chapter-3");

        var req = new CreateUserBookBookmarkRequest(chapter.Id, "word:42", "Note");
        var (dto, error) = await h.Service.CreateBookmarkAsync(userId, book.Id, req, CancellationToken.None);

        Assert.Null(error);
        Assert.NotNull(dto);
        Assert.Equal(chapter.Id, dto!.ChapterId);
        Assert.Equal("chapter-3", dto.ChapterSlug);
        Assert.Equal("word:42", dto.Locator);

        var list = await h.Service.GetBookmarksAsync(userId, book.Id, CancellationToken.None);
        var listed = Assert.Single(list);
        Assert.Equal(chapter.Id, listed.ChapterId);
        Assert.Equal("chapter-3", listed.ChapterSlug);
    }

    // A supplied ChapterId that isn't a chapter of this book is still rejected.
    [Fact]
    public async Task CreateBookmarkAsync_UnknownChapterId_ReturnsChapterNotFound()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        var book = h.SeedBook(userId);

        var req = new CreateUserBookBookmarkRequest(Guid.NewGuid(), "word:1", null);
        var (dto, error) = await h.Service.CreateBookmarkAsync(userId, book.Id, req, CancellationToken.None);

        Assert.Null(dto);
        Assert.Equal("Chapter not found", error);
        Assert.Empty(h.Bookmarks);
    }

    // A bookmark with neither chapter nor locator is meaningless — reject up front.
    [Fact]
    public async Task CreateBookmarkAsync_MissingLocator_ReturnsError()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        var book = h.SeedBook(userId);

        var req = new CreateUserBookBookmarkRequest(ChapterId: null, Locator: "", Title: null);
        var (dto, error) = await h.Service.CreateBookmarkAsync(userId, book.Id, req, CancellationToken.None);

        Assert.Null(dto);
        Assert.Equal("Locator is required", error);
        Assert.Empty(h.Bookmarks);
    }

    // Delete round-trips for a page bookmark.
    [Fact]
    public async Task DeleteBookmarkAsync_PageBookmark_RemovesIt()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        var book = h.SeedBook(userId);
        var (dto, _) = await h.Service.CreateBookmarkAsync(
            userId, book.Id, new CreateUserBookBookmarkRequest(null, "page:17", "Page 17"), CancellationToken.None);

        var (success, error) = await h.Service.DeleteBookmarkAsync(userId, book.Id, dto!.Id, CancellationToken.None);

        Assert.True(success);
        Assert.Null(error);
        Assert.Empty(h.Bookmarks);
    }

    // Owner scoping: another user cannot list a book's bookmarks (user_id filter).
    [Fact]
    public async Task GetBookmarksAsync_ForeignUser_SeesNothing()
    {
        var h = new Harness();
        var owner = Guid.NewGuid();
        var book = h.SeedBook(owner);
        await h.Service.CreateBookmarkAsync(
            owner, book.Id, new CreateUserBookBookmarkRequest(null, "page:17", null), CancellationToken.None);

        var list = await h.Service.GetBookmarksAsync(Guid.NewGuid(), book.Id, CancellationToken.None);

        Assert.Empty(list);
    }

    // Owner scoping: creating a bookmark on a book you don't own is rejected.
    [Fact]
    public async Task CreateBookmarkAsync_ForeignUser_ReturnsBookNotFound()
    {
        var h = new Harness();
        var owner = Guid.NewGuid();
        var book = h.SeedBook(owner);

        var (dto, error) = await h.Service.CreateBookmarkAsync(
            Guid.NewGuid(), book.Id, new CreateUserBookBookmarkRequest(null, "page:17", null), CancellationToken.None);

        Assert.Null(dto);
        Assert.Equal("Book not found", error);
        Assert.Empty(h.Bookmarks);
    }
}
