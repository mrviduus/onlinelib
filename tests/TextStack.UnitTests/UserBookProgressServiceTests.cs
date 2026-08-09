using Application.Common.Interfaces;
using Application.UserBooks;
using Contracts.UserBooks;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace TextStack.UnitTests;

// ADR-012 S2: user-book reading progress may be PAGE-based (PDF "Original layout",
// chapterless) or chapter-based (reflow/EPUB). These cover the upsert→GET round-trip
// for both, plus the >=0.99 auto-complete invariant. Sets are List<T>-backed Moq
// (production AppDbContext can't load on EF InMemory — see UserBookClipServiceTests).
public class UserBookProgressServiceTests
{
    private sealed class Harness
    {
        public List<User> Users { get; } = [];
        public List<UserBook> UserBooks { get; } = [];
        public UserBookService Service { get; }

        public Harness()
        {
            var db = new Mock<IAppDbContext>();
            db.Setup(x => x.Users).Returns(() => FakeSet(Users).Object);
            db.Setup(x => x.UserBooks).Returns(() => FakeSet(UserBooks).Object);
            db.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(0);

            Service = new UserBookService(db.Object, new Mock<IFileStorageService>().Object, TestEntitlements.Resolver);
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
        return set;
    }

    [Fact]
    public async Task UpsertProgressAsync_PageBasedNullChapter_PersistsAndRoundTrips()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        var book = h.SeedBook(userId);

        var req = new UpsertUserBookProgressRequest(
            ChapterSlug: null, Locator: "page:17", Percent: 0.16, UpdatedAt: null);

        var (success, error) = await h.Service.UpsertProgressAsync(userId, book.Id, req, CancellationToken.None);

        Assert.True(success);
        Assert.Null(error);
        Assert.Null(book.ProgressChapterSlug);
        Assert.Equal("page:17", book.ProgressLocator);
        Assert.Equal(0.16, book.ProgressPercent);
        Assert.NotNull(book.ProgressUpdatedAt);
        Assert.Null(book.CompletedAt);

        // Round-trips via GET even with a null chapter (page-based progress must not 404).
        var got = await h.Service.GetProgressAsync(userId, book.Id, CancellationToken.None);
        Assert.NotNull(got);
        Assert.Null(got!.ChapterSlug);
        Assert.Equal("page:17", got.Locator);
        Assert.Equal(0.16, got.Percent);
    }

    [Fact]
    public async Task UpsertProgressAsync_ChapterBased_StillPersistsAndRoundTrips()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        var book = h.SeedBook(userId);

        var req = new UpsertUserBookProgressRequest(
            ChapterSlug: "chapter-3", Locator: "word:42", Percent: 0.5, UpdatedAt: null);

        var (success, _) = await h.Service.UpsertProgressAsync(userId, book.Id, req, CancellationToken.None);

        Assert.True(success);
        Assert.Equal("chapter-3", book.ProgressChapterSlug);

        var got = await h.Service.GetProgressAsync(userId, book.Id, CancellationToken.None);
        Assert.NotNull(got);
        Assert.Equal("chapter-3", got!.ChapterSlug);
        Assert.Equal("word:42", got.Locator);
        Assert.Equal(0.5, got.Percent);
    }

    [Fact]
    public async Task UpsertProgressAsync_PercentAtLeast099_SetsCompletedAt()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        var book = h.SeedBook(userId);

        var req = new UpsertUserBookProgressRequest(
            ChapterSlug: null, Locator: "page:200", Percent: 0.99, UpdatedAt: null);

        await h.Service.UpsertProgressAsync(userId, book.Id, req, CancellationToken.None);

        Assert.NotNull(book.CompletedAt);
        Assert.True(book.IsRead);
        Assert.NotNull(book.ReadAt);
    }

    [Fact]
    public async Task GetProgressAsync_NoProgressRecorded_ReturnsNull()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        var book = h.SeedBook(userId);

        // Neither chapter nor locator set → nothing to resume.
        var got = await h.Service.GetProgressAsync(userId, book.Id, CancellationToken.None);

        Assert.Null(got);
    }
}
