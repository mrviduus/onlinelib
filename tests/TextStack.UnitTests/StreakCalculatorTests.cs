using Application.Common.Interfaces;
using Application.ReadingTracking;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace TextStack.UnitTests;

// R5 slice-3: StreakCalculator.* over a Moq IAppDbContext whose ReadingSessions / VocabularyReviews
// DbSets are backed by List<T> (async LINQ via TestAsyncQueryable). Behaviour-preservation tests for
// the streak helpers moved verbatim out of ReadingTrackingEndpoints (siteId parameter dropped).
public class StreakCalculatorTests
{
    private sealed class Harness
    {
        public List<ReadingSession> Sessions { get; } = [];
        public List<VocabularyReview> Reviews { get; } = [];
        public Mock<IAppDbContext> Db { get; } = new();

        public Harness()
        {
            Db.Setup(x => x.ReadingSessions).Returns(() => FakeSet(Sessions).Object);
            Db.Setup(x => x.VocabularyReviews).Returns(() => FakeSet(Reviews).Object);
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

    private static DateTimeOffset UtcT(int y, int mo, int d, int h, int mi)
        => new(y, mo, d, h, mi, 0, TimeSpan.Zero);

    private static ReadingSession Session(Guid userId, DateTimeOffset start, int dur) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        StartedAt = start,
        EndedAt = start,
        DurationSeconds = dur,
        WordsRead = 0,
        StartPercent = 0,
        EndPercent = 0,
        CreatedAt = start,
    };

    private static VocabularyReview Review(Guid userId, DateTimeOffset at) => new()
    {
        Id = Guid.NewGuid(),
        VocabularyWordId = Guid.NewGuid(),
        UserId = userId,
        ReviewMode = "multiple_choice",
        IsCorrect = true,
        CreatedAt = at,
    };

    // now = 2025-03-15 12:00Z; streak threshold 5 min = 300s throughout.
    private static readonly DateTimeOffset Now = UtcT(2025, 3, 15, 12, 0);
    private const int Threshold = 5;

    [Fact]
    public async Task CalculateStreak_NoActivity_ReturnsZero()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();

        var streak = await StreakCalculator.CalculateStreak(h.Db.Object, userId, Threshold, Now, CancellationToken.None);
        Assert.Equal(0, streak);
    }

    [Fact]
    public async Task CalculateLongestStreak_NoActivity_ReturnsZero()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();

        var longest = await StreakCalculator.CalculateLongestStreak(h.Db.Object, userId, Threshold, CancellationToken.None);
        Assert.Equal(0, longest);
    }

    [Fact]
    public async Task CalculateStreak_SingleQualifyingToday_ReturnsOne()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        h.Sessions.Add(Session(userId, UtcT(2025, 3, 15, 8, 0), 600)); // 10 min today

        var current = await StreakCalculator.CalculateStreak(h.Db.Object, userId, Threshold, Now, CancellationToken.None);
        var longest = await StreakCalculator.CalculateLongestStreak(h.Db.Object, userId, Threshold, CancellationToken.None);

        Assert.Equal(1, current);
        Assert.Equal(1, longest);
    }

    [Fact]
    public async Task Streaks_GapResetsLongest_CurrentCountsBackFromToday()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        // Run of 3 (Mar 1-3), an isolated day (Mar 10), a run of 2 ending today (Mar 14-15).
        foreach (var d in new[] { 1, 2, 3, 10, 14, 15 })
            h.Sessions.Add(Session(userId, UtcT(2025, 3, d, 8, 0), 600));

        var current = await StreakCalculator.CalculateStreak(h.Db.Object, userId, Threshold, Now, CancellationToken.None);
        var longest = await StreakCalculator.CalculateLongestStreak(h.Db.Object, userId, Threshold, CancellationToken.None);

        Assert.Equal(2, current);  // 03-15, 03-14, then 03-13 gap stops it
        Assert.Equal(3, longest);  // 03-01..03-03 — the gap resets the running count
    }

    [Fact]
    public async Task CalculateStreak_TodayBelowThreshold_CountsFromYesterday()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        h.Sessions.Add(Session(userId, UtcT(2025, 3, 13, 8, 0), 600));
        h.Sessions.Add(Session(userId, UtcT(2025, 3, 14, 8, 0), 600));
        h.Sessions.Add(Session(userId, UtcT(2025, 3, 15, 8, 0), 120)); // 2 min today → does NOT qualify

        var current = await StreakCalculator.CalculateStreak(h.Db.Object, userId, Threshold, Now, CancellationToken.None);
        Assert.Equal(2, current); // today skipped, streak runs 03-14, 03-13
    }

    [Fact]
    public async Task CalculateStreak_TzShiftAcrossMidnight_ChangesQualifyingDay()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        h.Sessions.Add(Session(userId, UtcT(2025, 3, 15, 0, 30), 600));  // just after UTC midnight
        h.Sessions.Add(Session(userId, UtcT(2025, 3, 14, 12, 0), 600));

        // tz 0: sessions land on 03-15 + 03-14 → streak 2 back from today.
        var utc = await StreakCalculator.CalculateStreak(h.Db.Object, userId, Threshold, Now, CancellationToken.None, TimeSpan.Zero);
        Assert.Equal(2, utc);

        // tz -60: the 00:30 session shifts to 03-14, both merge onto 03-14; today (03-15) no longer
        // qualifies, so the streak counts only 03-14 → 1.
        var minus = await StreakCalculator.CalculateStreak(h.Db.Object, userId, Threshold, Now, CancellationToken.None, TimeSpan.FromMinutes(-60));
        Assert.Equal(1, minus);
    }

    [Fact]
    public async Task CalculateStreak_VocabReviewsPushSubThresholdDayOverThreshold()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        h.Sessions.Add(Session(userId, UtcT(2025, 3, 15, 8, 0), 200)); // 200s < 300s alone
        for (var i = 0; i < 4; i++)
            h.Reviews.Add(Review(userId, UtcT(2025, 3, 15, 9, i)));    // +4*30 = 120s → 320s total

        var current = await StreakCalculator.CalculateStreak(h.Db.Object, userId, Threshold, Now, CancellationToken.None);
        Assert.Equal(1, current);
    }
}
