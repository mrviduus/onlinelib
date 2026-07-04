using Application.Common.Interfaces;
using Application.ReadingTracking;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace TextStack.UnitTests;

// R5 slice-1: ReadingStatsService.GetBookStatsAsync over a Moq IAppDbContext whose ReadingSessions /
// Editions / UserBooks DbSets are backed by plain List<T> (async LINQ enabled via TestAsyncQueryable —
// same harness ConceptClusteringServiceTests uses, because the production AppDbContext can't load on
// the EF InMemory provider due to NpgsqlTsVector). This is a behaviour-preservation test: the handler
// body was moved verbatim into the service, so the exact aggregate values below double as a golden
// snapshot of the pre-refactor JSON response.
public class ReadingStatsServiceTests
{
    private sealed class Harness
    {
        public List<ReadingSession> Sessions { get; } = [];
        public List<Edition> Editions { get; } = [];
        public List<UserBook> UserBooks { get; } = [];
        public Mock<IAppDbContext> Db { get; } = new();
        public ReadingStatsService Service { get; }

        public Harness()
        {
            Db.Setup(x => x.ReadingSessions).Returns(() => FakeSet(Sessions).Object);
            Db.Setup(x => x.Editions).Returns(() => FakeSet(Editions).Object);
            Db.Setup(x => x.UserBooks).Returns(() => FakeSet(UserBooks).Object);
            Service = new ReadingStatsService(Db.Object);
        }
    }

    // Builds a DbSet<T> mock backed by `data`: queryable (sync + async). (Read-only service — no
    // Add/Remove needed.) Mirrors ConceptClusteringServiceTests.FakeSet.
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

    private static DateTimeOffset Utc(int y, int mo, int d)
        => new(y, mo, d, 0, 0, 0, TimeSpan.Zero);

    // ── Fixed graph shared by the tests ────────────────────────────────────────────────────────
    // e1: en, chapters 30000+20000=50000 words (=>200 pages), genre Fiction, author Tolkien.
    //     finished 2025-01-11 (start 2025-01-01) → 10 days; 3600s / 10000 words → 166wpm "medium".
    // e2: en, chapter 100000 words (=>400 pages), genres Fiction+SciFi, authors Tolkien+Asimov.
    //     finished 2024-06-04 (start 2024-06-01) → 3 days; 7200s / 40000 words → 333wpm "fast".
    // u1: uk user book, genre "Fiction", author "Lem", 25000 words (=>100 pages). finished 2025-03-02.
    // e3: an edition read only to 30% → NOT finished → excluded everywhere.
    private static (Guid e1, Guid e2, Guid u1) SeedGraph(Harness h, Guid userId)
    {
        var e1 = Guid.NewGuid();
        var e2 = Guid.NewGuid();
        var e3 = Guid.NewGuid();
        var u1 = Guid.NewGuid();

        var fiction = new Genre { Id = Guid.NewGuid(), Slug = "fiction", Name = "Fiction" };
        var scifi = new Genre { Id = Guid.NewGuid(), Slug = "scifi", Name = "SciFi" };
        var tolkien = new Author { Id = Guid.NewGuid(), Slug = "tolkien", Name = "Tolkien" };
        var asimov = new Author { Id = Guid.NewGuid(), Slug = "asimov", Name = "Asimov" };

        h.Editions.Add(new Edition
        {
            Id = e1,
            Language = "en",
            Slug = "e1",
            Title = "E1",
            Chapters =
            [
                new Chapter { Id = Guid.NewGuid(), EditionId = e1, Title = "c1", Html = "", PlainText = "", WordCount = 30000 },
                new Chapter { Id = Guid.NewGuid(), EditionId = e1, Title = "c2", Html = "", PlainText = "", WordCount = 20000 },
            ],
            Genres = [fiction],
            EditionAuthors =
            [
                new EditionAuthor { EditionId = e1, AuthorId = tolkien.Id, Author = tolkien, Order = 0, Role = AuthorRole.Author },
            ],
        });

        h.Editions.Add(new Edition
        {
            Id = e2,
            Language = "en",
            Slug = "e2",
            Title = "E2",
            Chapters =
            [
                new Chapter { Id = Guid.NewGuid(), EditionId = e2, Title = "c1", Html = "", PlainText = "", WordCount = 100000 },
            ],
            Genres = [fiction, scifi],
            EditionAuthors =
            [
                new EditionAuthor { EditionId = e2, AuthorId = tolkien.Id, Author = tolkien, Order = 0, Role = AuthorRole.Author },
                new EditionAuthor { EditionId = e2, AuthorId = asimov.Id, Author = asimov, Order = 1, Role = AuthorRole.Author },
            ],
        });

        h.UserBooks.Add(new UserBook
        {
            Id = u1,
            UserId = userId,
            Title = "U1",
            Slug = "u1",
            Language = "uk",
            Genre = "Fiction",
            Author = "Lem",
            TotalWordCount = 25000,
        });

        // e1 sessions: an early 50% read, then the finishing read.
        h.Sessions.Add(Session(userId, editionId: e1, endPct: 0.5, start: Utc(2025, 1, 1), end: Utc(2025, 1, 2), dur: 1800, words: 5000));
        h.Sessions.Add(Session(userId, editionId: e1, endPct: 1.0, start: Utc(2025, 1, 5), end: Utc(2025, 1, 11), dur: 1800, words: 5000));
        // e2 finishing session (EndPercent exactly at the 0.99 threshold).
        h.Sessions.Add(Session(userId, editionId: e2, endPct: 0.99, start: Utc(2024, 6, 1), end: Utc(2024, 6, 4), dur: 7200, words: 40000));
        // u1 finishing session.
        h.Sessions.Add(Session(userId, userBookId: u1, endPct: 1.0, start: Utc(2025, 3, 1), end: Utc(2025, 3, 2), dur: 600, words: 2000));
        // e3 never finished (30%) → excluded from every projection.
        h.Sessions.Add(Session(userId, editionId: e3, endPct: 0.3, start: Utc(2025, 2, 1), end: Utc(2025, 2, 2), dur: 900, words: 1000));

        return (e1, e2, u1);
    }

    private static ReadingSession Session(
        Guid userId, double endPct, DateTimeOffset start, DateTimeOffset end, int dur, int words,
        Guid? editionId = null, Guid? userBookId = null) => new()
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            EditionId = editionId,
            UserBookId = userBookId,
            StartedAt = start,
            EndedAt = end,
            DurationSeconds = dur,
            WordsRead = words,
            StartPercent = 0,
            EndPercent = endPct,
            CreatedAt = start,
        };

    [Fact]
    public async Task GetBookStats_NoYearFilter_AggregatesEditionsAndUserBooksExactly()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        SeedGraph(h, userId);

        var r = await h.Service.GetBookStatsAsync(userId, year: null, CancellationToken.None);

        // Totals
        Assert.Equal(3, r.BooksFinished);                 // 2 editions + 1 user book
        Assert.Equal(700, r.TotalPages);                  // (50000+100000)/250 + 25000/250 = 600+100
        Assert.Equal(6.5, r.AvgDaysToFinish);             // (10 + 3) / 2

        // AvailableYears computed BEFORE the (absent) year filter, descending.
        Assert.Equal(new[] { 2025, 2024 }, r.AvailableYears);

        // Genre stats: fiction seen 3× (e1, e2, u1), scifi 1×; ordered by count desc.
        Assert.Equal(2, r.GenreStats.Count);
        Assert.Equal(new GenreStatDtoTuple("Fiction", "fiction", 3), Tuple(r.GenreStats[0]));
        Assert.Equal(new GenreStatDtoTuple("SciFi", "scifi", 1), Tuple(r.GenreStats[1]));

        // Author stats: tolkien 2×, then the two count-1 authors in stable insertion order; Take(10).
        Assert.Equal(3, r.AuthorStats.Count);
        Assert.Equal(("Tolkien", "tolkien", 2), (r.AuthorStats[0].Name, r.AuthorStats[0].Slug, r.AuthorStats[0].Count));
        Assert.Equal(("Asimov", "asimov", 1), (r.AuthorStats[1].Name, r.AuthorStats[1].Slug, r.AuthorStats[1].Count));
        Assert.Equal(("Lem", "lem", 1), (r.AuthorStats[2].Name, r.AuthorStats[2].Slug, r.AuthorStats[2].Count));

        // Language stats: en 2×, uk 1×.
        Assert.Equal(2, r.LanguageStats.Count);
        Assert.Equal(("en", 2), (r.LanguageStats[0].Language, r.LanguageStats[0].Count));
        Assert.Equal(("uk", 1), (r.LanguageStats[1].Language, r.LanguageStats[1].Count));

        // BooksOverTime keyed by YEAR (no year filter), ascending period.
        Assert.Equal(2, r.BooksOverTime.Count);
        Assert.Equal(("2024", 1, 400), (r.BooksOverTime[0].Period, r.BooksOverTime[0].Books, r.BooksOverTime[0].Pages));
        Assert.Equal(("2025", 2, 300), (r.BooksOverTime[1].Period, r.BooksOverTime[1].Books, r.BooksOverTime[1].Pages));

        // Length buckets (first-occurrence group order): 200p medium, 400p long, 100p short.
        Assert.Equal(3, r.BookLengthDistribution.Count);
        Assert.Equal(("medium", 1), (r.BookLengthDistribution[0].Bucket, r.BookLengthDistribution[0].Count));
        Assert.Equal(("long", 1), (r.BookLengthDistribution[1].Bucket, r.BookLengthDistribution[1].Count));
        Assert.Equal(("short", 1), (r.BookLengthDistribution[2].Bucket, r.BookLengthDistribution[2].Count));

        // Pace (integer/double wpm boundaries at 150/300): e1 166wpm medium, e2 333wpm fast.
        Assert.Equal(2, r.PaceStats.Count);
        Assert.Equal(("medium", 1), (r.PaceStats[0].Pace, r.PaceStats[0].Count));
        Assert.Equal(("fast", 1), (r.PaceStats[1].Pace, r.PaceStats[1].Count));

        // Reading time by genre: fiction 3600(e1)+7200(e2)=10800, scifi 7200; desc by seconds.
        Assert.Equal(2, r.ReadingTimeByGenre.Count);
        Assert.Equal(("Fiction", "fiction", 10800L), (r.ReadingTimeByGenre[0].Name, r.ReadingTimeByGenre[0].Slug, r.ReadingTimeByGenre[0].Seconds));
        Assert.Equal(("SciFi", "scifi", 7200L), (r.ReadingTimeByGenre[1].Name, r.ReadingTimeByGenre[1].Slug, r.ReadingTimeByGenre[1].Seconds));

        // Reading time by author: tolkien 10800, asimov 7200; Take(10).
        Assert.Equal(2, r.ReadingTimeByAuthor.Count);
        Assert.Equal(("Tolkien", "tolkien", 10800L), (r.ReadingTimeByAuthor[0].Name, r.ReadingTimeByAuthor[0].Slug, r.ReadingTimeByAuthor[0].Seconds));
        Assert.Equal(("Asimov", "asimov", 7200L), (r.ReadingTimeByAuthor[1].Name, r.ReadingTimeByAuthor[1].Slug, r.ReadingTimeByAuthor[1].Seconds));
    }

    [Fact]
    public async Task GetBookStats_MaterializesEachDbSetSeparately_SixQueries()
    {
        // Behaviour guard: the handler runs 4 ReadingSessions queries + 1 Editions + 1 UserBooks =
        // 6 .ToListAsync() boundaries. If someone "optimizes" by folding queries together, these
        // access counts change and this test catches it.
        var h = new Harness();
        var userId = Guid.NewGuid();
        SeedGraph(h, userId);

        await h.Service.GetBookStatsAsync(userId, year: null, CancellationToken.None);

        h.Db.Verify(x => x.ReadingSessions, Times.Exactly(4));
        h.Db.Verify(x => x.Editions, Times.Once);
        h.Db.Verify(x => x.UserBooks, Times.Once);
    }

    [Fact]
    public async Task GetBookStats_WithYearFilter_KeepsAvailableYearsAndSwitchesToMonthlyPeriods()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        SeedGraph(h, userId);

        var r = await h.Service.GetBookStatsAsync(userId, year: 2025, CancellationToken.None);

        // Only 2025 finishes survive: e1 + u1 (e2 is 2024).
        Assert.Equal(2, r.BooksFinished);
        Assert.Equal(300, r.TotalPages);      // 50000/250 + 25000/250 = 200 + 100
        Assert.Equal(10.0, r.AvgDaysToFinish); // only e1 remains → 10 days

        // AvailableYears still reflects the full history (computed before the filter).
        Assert.Equal(new[] { 2025, 2024 }, r.AvailableYears);

        // BooksOverTime now keyed by yyyy-MM.
        Assert.Equal(2, r.BooksOverTime.Count);
        Assert.Equal(("2025-01", 1, 200), (r.BooksOverTime[0].Period, r.BooksOverTime[0].Books, r.BooksOverTime[0].Pages));
        Assert.Equal(("2025-03", 1, 100), (r.BooksOverTime[1].Period, r.BooksOverTime[1].Books, r.BooksOverTime[1].Pages));
    }

    [Fact]
    public async Task GetBookStats_LengthBucketBoundaries_149Short_150Medium_399Medium_400Long()
    {
        // Exercise the exact <150 / <400 bucket cut-points with editions whose page counts land on
        // 149, 150, 399, 400 (words = pages * 250).
        var h = new Harness();
        var userId = Guid.NewGuid();

        void AddFinishedEdition(int words, int monthDay)
        {
            var id = Guid.NewGuid();
            h.Editions.Add(new Edition
            {
                Id = id,
                Language = "en",
                Slug = "e" + id.ToString("N")[..6],
                Title = "E",
                Chapters = [new Chapter { Id = Guid.NewGuid(), EditionId = id, Title = "c", Html = "", PlainText = "", WordCount = words }],
                Genres = [],
                EditionAuthors = [],
            });
            h.Sessions.Add(Session(userId, editionId: id, endPct: 1.0, start: Utc(2025, 1, monthDay), end: Utc(2025, 1, monthDay), dur: 60, words: 10));
        }

        AddFinishedEdition(149 * 250, 1); // 149 pages → short
        AddFinishedEdition(150 * 250, 2); // 150 pages → medium (>=150)
        AddFinishedEdition(399 * 250, 3); // 399 pages → medium
        AddFinishedEdition(400 * 250, 4); // 400 pages → long (>=400)

        var r = await h.Service.GetBookStatsAsync(userId, year: null, CancellationToken.None);

        var byBucket = r.BookLengthDistribution.ToDictionary(b => b.Bucket, b => b.Count);
        Assert.Equal(1, byBucket["short"]);   // 149
        Assert.Equal(2, byBucket["medium"]);  // 150 + 399
        Assert.Equal(1, byBucket["long"]);    // 400
    }

    // ── R5 slice-2: GetDailyStatsAsync ──────────────────────────────────────────────────────────

    // UTC session start with an explicit time-of-day (the daily-stats bucketing is tz-sensitive, so
    // the raw plain-Utc(y,mo,d) midnight helper isn't enough for the boundary cases).
    private static DateTimeOffset UtcT(int y, int mo, int d, int h, int mi)
        => new(y, mo, d, h, mi, 0, TimeSpan.Zero);

    [Fact]
    public async Task GetDailyStats_NoTzOffset_BucketsByUtcDate_SumsMinutesWordsCount_NoGapFill_Sorted()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();

        // == from boundary: 2025-01-01 00:00 UTC is included by the `>= from` filter.
        h.Sessions.Add(Session(userId, endPct: 0.5, start: UtcT(2025, 1, 1, 0, 0), end: UtcT(2025, 1, 1, 0, 10), dur: 100, words: 10, editionId: Guid.NewGuid()));
        // Two sessions on Jan 5 → merge into one bucket.
        h.Sessions.Add(Session(userId, endPct: 0.5, start: UtcT(2025, 1, 5, 10, 0), end: UtcT(2025, 1, 5, 10, 10), dur: 600, words: 100, editionId: Guid.NewGuid()));
        h.Sessions.Add(Session(userId, endPct: 0.5, start: UtcT(2025, 1, 5, 14, 0), end: UtcT(2025, 1, 5, 14, 5), dur: 300, words: 50, editionId: Guid.NewGuid()));
        // Jan 8 single session (leaves Jan 2,3,4,6,7 as gaps that must NOT be filled).
        h.Sessions.Add(Session(userId, endPct: 0.5, start: UtcT(2025, 1, 8, 10, 0), end: UtcT(2025, 1, 8, 10, 20), dur: 1200, words: 200, editionId: Guid.NewGuid()));
        // Out of range on both sides → excluded.
        h.Sessions.Add(Session(userId, endPct: 0.5, start: UtcT(2024, 12, 31, 23, 59), end: UtcT(2025, 1, 1, 0, 0), dur: 999, words: 999, editionId: Guid.NewGuid()));
        h.Sessions.Add(Session(userId, endPct: 0.5, start: UtcT(2025, 2, 1, 0, 1), end: UtcT(2025, 2, 1, 0, 2), dur: 999, words: 999, editionId: Guid.NewGuid()));

        var from = UtcT(2025, 1, 1, 0, 0);
        var to = UtcT(2025, 1, 31, 0, 0);

        var r = await h.Service.GetDailyStatsAsync(userId, from, to, TimeSpan.Zero, CancellationToken.None);

        // Exactly 3 buckets — gaps are NOT back-filled with empty days.
        Assert.Equal(3, r.Count);
        // Ascending by date.
        Assert.Equal(new DateTime(2025, 1, 1), r[0].Date);
        Assert.Equal((100, 10, 1), (r[0].TotalSeconds, r[0].TotalWords, r[0].SessionCount));
        Assert.Equal(new DateTime(2025, 1, 5), r[1].Date);
        Assert.Equal((900, 150, 2), (r[1].TotalSeconds, r[1].TotalWords, r[1].SessionCount)); // 600+300, 100+50
        Assert.Equal(new DateTime(2025, 1, 8), r[2].Date);
        Assert.Equal((1200, 200, 1), (r[2].TotalSeconds, r[2].TotalWords, r[2].SessionCount));
    }

    [Fact]
    public async Task GetDailyStats_TzOffset_ShiftsNearMidnightSessionsIntoCorrectDayBucket()
    {
        // Two sessions straddling both midnight edges of 2025-03-15 UTC:
        //   sA 00:30 UTC (just after midnight), sB 23:30 UTC (just before midnight).
        var h = new Harness();
        var userId = Guid.NewGuid();
        h.Sessions.Add(Session(userId, endPct: 0.5, start: UtcT(2025, 3, 15, 0, 30), end: UtcT(2025, 3, 15, 0, 40), dur: 600, words: 100, editionId: Guid.NewGuid()));
        h.Sessions.Add(Session(userId, endPct: 0.5, start: UtcT(2025, 3, 15, 23, 30), end: UtcT(2025, 3, 15, 23, 40), dur: 300, words: 50, editionId: Guid.NewGuid()));

        var from = UtcT(2025, 3, 1, 0, 0);
        var to = UtcT(2025, 4, 1, 0, 0);

        // Offset 0: both fall on Mar 15 → one merged bucket.
        var utc = await h.Service.GetDailyStatsAsync(userId, from, to, TimeSpan.Zero, CancellationToken.None);
        Assert.Single(utc);
        Assert.Equal(new DateTime(2025, 3, 15), utc[0].Date);
        Assert.Equal((900, 150, 2), (utc[0].TotalSeconds, utc[0].TotalWords, utc[0].SessionCount));

        // Offset -60min: sA 00:30→2025-03-14 23:30 (prev day), sB 23:30→2025-03-15 22:30 (same day).
        var minus = await h.Service.GetDailyStatsAsync(userId, from, to, TimeSpan.FromMinutes(-60), CancellationToken.None);
        Assert.Equal(2, minus.Count);
        Assert.Equal(new DateTime(2025, 3, 14), minus[0].Date);
        Assert.Equal((600, 100, 1), (minus[0].TotalSeconds, minus[0].TotalWords, minus[0].SessionCount));
        Assert.Equal(new DateTime(2025, 3, 15), minus[1].Date);
        Assert.Equal((300, 50, 1), (minus[1].TotalSeconds, minus[1].TotalWords, minus[1].SessionCount));

        // Offset +60min: sA 00:30→2025-03-15 01:30 (same day), sB 23:30→2025-03-16 00:30 (next day).
        var plus = await h.Service.GetDailyStatsAsync(userId, from, to, TimeSpan.FromMinutes(60), CancellationToken.None);
        Assert.Equal(2, plus.Count);
        Assert.Equal(new DateTime(2025, 3, 15), plus[0].Date);
        Assert.Equal((600, 100, 1), (plus[0].TotalSeconds, plus[0].TotalWords, plus[0].SessionCount));
        Assert.Equal(new DateTime(2025, 3, 16), plus[1].Date);
        Assert.Equal((300, 50, 1), (plus[1].TotalSeconds, plus[1].TotalWords, plus[1].SessionCount));
    }

    // Small helpers to make genre tuple asserts read cleanly.
    private readonly record struct GenreStatDtoTuple(string Name, string Slug, int Count);
    private static GenreStatDtoTuple Tuple(Contracts.ReadingTracking.GenreStatDto g) => new(g.Name, g.Slug, g.Count);
}
