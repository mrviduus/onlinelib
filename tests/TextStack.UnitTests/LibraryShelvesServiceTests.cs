using Application.Library;
using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace TextStack.UnitTests;

// Fix D (part 1): UserBook.ProgressPercent is canonically book-wide. The library
// card path (UserBookService) returns it verbatim; the Continue-reading shelf must
// do the SAME — it used to feed the stored value back into BookProgressCalculator as
// a chapter-% and re-add prior-chapter words, so the same book showed e.g. 89% on the
// card and 99% on the shelf (the "progress jumps around" bug). This asserts the shelf
// now surfaces the stored book-wide percent unchanged (== the card value), no double
// count — even when the book has many chapters that WOULD change a recompute.
public class LibraryShelvesServiceTests
{
    private sealed class Harness
    {
        public List<ReadingSession> Sessions { get; } = [];
        public List<UserBook> UserBooks { get; } = [];
        public List<UserChapter> UserChapters { get; } = [];
        public List<UserLibrary> UserLibraries { get; } = [];
        public List<Edition> Editions { get; } = [];
        public List<ReadingProgress> ReadingProgresses { get; } = [];
        public List<Chapter> Chapters { get; } = [];
        public Mock<IAppDbContext> Db { get; } = new();
        public LibraryShelvesService Service { get; }

        public Harness()
        {
            Db.Setup(x => x.ReadingSessions).Returns(() => FakeSet(Sessions).Object);
            Db.Setup(x => x.UserBooks).Returns(() => FakeSet(UserBooks).Object);
            Db.Setup(x => x.UserChapters).Returns(() => FakeSet(UserChapters).Object);
            Db.Setup(x => x.UserLibraries).Returns(() => FakeSet(UserLibraries).Object);
            Db.Setup(x => x.Editions).Returns(() => FakeSet(Editions).Object);
            Db.Setup(x => x.ReadingProgresses).Returns(() => FakeSet(ReadingProgresses).Object);
            Db.Setup(x => x.Chapters).Returns(() => FakeSet(Chapters).Object);
            Service = new LibraryShelvesService(Db.Object);
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
    public async Task GetShelvesAsync_UserBookBookWidePercent_ContinueShelfMatchesCardNoDoubleCount()
    {
        var userId = Guid.NewGuid();
        var siteId = Guid.NewGuid();
        var bookId = Guid.NewGuid();
        const double storedBookWide = 0.89; // what the reader persisted + the card shows

        var h = new Harness();
        h.UserBooks.Add(new UserBook
        {
            Id = bookId,
            UserId = userId,
            Title = "Test Book",
            Slug = "test-book",
            Language = "en",
            TotalWordCount = 1000,
            ProgressPercent = storedBookWide,
            // A chapter-2-of-10 position: if the shelf still recomputed, it would
            // read the 0.89 as chapter-2 scroll and collapse to ~0.19, not 0.89.
            ProgressChapterSlug = "chapter-2",
            ProgressUpdatedAt = DateTimeOffset.UtcNow,
            CreatedAt = DateTimeOffset.UtcNow.AddDays(-1),
        });
        for (var i = 1; i <= 10; i++)
        {
            h.UserChapters.Add(new UserChapter
            {
                Id = Guid.NewGuid(),
                UserBookId = bookId,
                ChapterNumber = i,
                Slug = $"chapter-{i}",
                Title = $"Chapter {i}",
                Html = "<p>x</p>",
                PlainText = "x",
                WordCount = 100,
                CreatedAt = DateTimeOffset.UtcNow,
            });
        }

        var shelves = await h.Service.GetShelvesAsync(userId, siteId, CancellationToken.None);

        var item = Assert.Single(shelves.ContinueReading);
        Assert.Equal(bookId, item.Id);
        Assert.Equal("userbook", item.Type);
        // Verbatim book-wide percent — identical to the card path, no re-added words.
        Assert.Equal(storedBookWide, item.ProgressPercent, 5);
    }
}
