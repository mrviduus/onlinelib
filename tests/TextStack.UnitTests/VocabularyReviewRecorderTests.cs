using Application.Common.Interfaces;
using Application.Vocabulary;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Moq;
using TextStack.UnitTests.Fakes;
using TextStack.Vocabulary;

namespace TextStack.UnitTests;

/// <summary>
/// The recorder is the single writer of spaced-repetition state. It exists because there were two ways
/// to answer a card and only one of them counted: ordinary review advanced the word, Smart session
/// handed its answers to the planner and wrote nothing, then reported "Accuracy 100%" over a card that
/// had not moved. These tests pin the write itself; the tutor endpoint's use of it is pinned by
/// <see cref="TutorAppliedWordIdsTests"/>.
///
/// Backed by a Moq <see cref="IAppDbContext"/> over plain lists — the production context can't load on
/// the EF InMemory provider (NpgsqlTsVector on Chapter), the same reason ConceptClusteringServiceTests
/// fakes its sets.
/// </summary>
public class VocabularyReviewRecorderTests
{
    private sealed class Harness
    {
        public List<VocabularyWord> Words { get; } = [];
        public List<VocabularyReview> Reviews { get; } = [];
        public List<UserVocabularySettings> Settings { get; } = [];
        public List<ReadingGoal> Goals { get; } = [];
        public List<ReadingSession> Sessions { get; } = [];
        public List<UserAchievement> Achievements { get; } = [];
        public VocabularyReviewRecorder Recorder { get; }

        public Harness()
        {
            var db = new Mock<IAppDbContext>();
            db.Setup(x => x.VocabularyWords).Returns(() => FakeSet(Words).Object);
            db.Setup(x => x.VocabularyReviews).Returns(() => FakeSet(Reviews).Object);
            db.Setup(x => x.UserVocabularySettings).Returns(() => FakeSet(Settings).Object);
            db.Setup(x => x.ReadingGoals).Returns(() => FakeSet(Goals).Object);
            db.Setup(x => x.ReadingSessions).Returns(() => FakeSet(Sessions).Object);
            db.Setup(x => x.UserAchievements).Returns(() => FakeSet(Achievements).Object);
            db.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(0);

            // The real engine — the point is that an answer reaches it, not that it is mocked away.
            Recorder = new VocabularyReviewRecorder(db.Object, new SrsEngine());
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
        return set;
    }

    private static VocabularyWord NewWord(Guid userId, Guid siteId) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        SiteId = siteId,
        Word = "peregrination",
        Language = "en",
        Stage = 0,
        ConsecutiveCorrect = 0,
        IntervalDays = 0,
        // In the past, which is what "due now" looks like — the exact state QA read back from the API.
        NextReviewAt = DateTimeOffset.UtcNow.AddHours(-1),
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow,
    };

    [Fact]
    public async Task RecordAsync_CorrectAnswerOnNewWord_AdvancesStageAndSchedulesAhead()
    {
        var userId = Guid.NewGuid();
        var siteId = Guid.NewGuid();
        var h = new Harness();
        var word = NewWord(userId, siteId);
        h.Words.Add(word);

        var result = await h.Recorder.RecordAsync(
            userId, siteId, word.Id, isCorrect: true, responseTimeMs: 1200, isPractice: false, TestContext.Current.CancellationToken);

        Assert.NotNull(result);
        Assert.Equal(0, result!.StageBefore);
        Assert.True(result.StageAfter > 0, "a correct answer on a new word must leave stage 0");
        Assert.True(word.NextReviewAt > DateTimeOffset.UtcNow, "the card must not still be due");
        Assert.Equal(1, word.TotalReviews);
        Assert.Equal(1, word.CorrectReviews);
        Assert.Single(h.Reviews);
    }

    [Fact]
    public async Task RecordAsync_Practice_LeavesScheduleFrozenButStillCounts()
    {
        // Practice is a drill: it must not disturb the schedule, but the day still counts toward the
        // streak, which reads VocabularyReviews. Both halves matter — this is the behaviour the
        // extraction had to preserve exactly.
        var userId = Guid.NewGuid();
        var siteId = Guid.NewGuid();
        var h = new Harness();
        var word = NewWord(userId, siteId);
        var dueBefore = word.NextReviewAt;
        h.Words.Add(word);

        var result = await h.Recorder.RecordAsync(
            userId, siteId, word.Id, isCorrect: true, responseTimeMs: 900, isPractice: true, TestContext.Current.CancellationToken);

        Assert.NotNull(result);
        Assert.Equal(0, word.Stage);
        Assert.Equal(dueBefore, word.NextReviewAt);
        Assert.Equal(0, word.TotalReviews);
        Assert.Single(h.Reviews);
        Assert.StartsWith("practice_", h.Reviews[0].ReviewMode);
    }

    [Fact]
    public async Task RecordAsync_WordOfAnotherUser_WritesNothing()
    {
        var h = new Harness();
        var word = NewWord(Guid.NewGuid(), Guid.NewGuid());
        h.Words.Add(word);

        var result = await h.Recorder.RecordAsync(
            Guid.NewGuid(), Guid.NewGuid(), word.Id, isCorrect: true, responseTimeMs: 500, isPractice: false, TestContext.Current.CancellationToken);

        Assert.Null(result);
        Assert.Equal(0, word.Stage);
        Assert.Empty(h.Reviews);
    }
}
