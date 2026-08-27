using Application.Common.Interfaces;
using Application.ReadingTracking;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;
using TextStack.Vocabulary;

namespace Application.Vocabulary;

/// <summary>The SRS state a recorded answer produced, for the caller to report back.</summary>
public sealed record RecordedReview(
    Guid WordId,
    int StageBefore,
    int StageAfter,
    double IntervalDays,
    DateTimeOffset NextReviewAt,
    int TotalReviews,
    int CorrectReviews);

/// <summary>
/// The one place an answer becomes spaced-repetition state.
///
/// It exists because there were two ways to answer a card and only one of them counted. Ordinary
/// Practice posted to <c>/me/vocabulary/review</c> and advanced the word; Smart session (the tutor)
/// posted its results to the planner instead, which read the learner's answers, planned the next turn
/// from them, and wrote nothing — so the session could report "Accuracy 100%" over a card whose stage,
/// interval and next-review date had not moved a millimetre. QA caught it by answering one card and
/// then reading the word back from the API.
///
/// The fix is not a second copy of the write. Both endpoints now call this, so "what an answer does"
/// has one definition and one place to change.
/// </summary>
public sealed class VocabularyReviewRecorder(IAppDbContext db, ISrsEngine srsEngine)
{
    /// <summary>
    /// Apply one answer. Returns <c>null</c> when the word does not exist or is not this user's.
    ///
    /// <paramref name="isPractice"/> keeps the existing drill semantics: no SRS movement at all, but a
    /// <c>practice_</c>-prefixed review row so the day still counts toward the streak, and no achievement
    /// check so answers cannot be farmed. Everything here is the behaviour <c>SubmitReview</c> had before
    /// the extraction; the tutor simply gained access to it.
    /// </summary>
    public async Task<RecordedReview?> RecordAsync(
        Guid userId,
        Guid siteId,
        Guid wordId,
        bool isCorrect,
        int responseTimeMs,
        bool isPractice,
        CancellationToken ct)
    {
        var word = await db.VocabularyWords.FirstOrDefaultAsync(w => w.Id == wordId && w.UserId == userId, ct);
        if (word is null) return null;

        var prevStage = word.Stage;
        var now = DateTimeOffset.UtcNow;

        var newStage = prevStage;
        var newInterval = word.IntervalDays;

        if (!isPractice)
        {
            var (calcStage, calcInterval, calcConsecutive) = srsEngine.Calculate(
                word.Stage, word.ConsecutiveCorrect, word.IntervalDays, isCorrect);
            newStage = calcStage;
            newInterval = calcInterval;
            word.Stage = newStage;
            word.IntervalDays = newInterval;
            word.ConsecutiveCorrect = calcConsecutive;
            word.NextReviewAt = now.AddDays(newInterval);

            word.LastReviewedAt = now;
            word.TotalReviews++;
            if (isCorrect) word.CorrectReviews++;
            word.UpdatedAt = now;

            // Anti-spiral F4: retire immediately on threshold cross. Waiting for
            // the 6h sweeper would re-surface the word in the next queue fetch,
            // negating the "Mastered" graduation UX. Respect AutoRetireEnabled —
            // users who disabled it should keep Mastered words reviewable.
            if (!word.IsRetired && srsEngine.ShouldAutoRetire(word.Stage, word.ConsecutiveCorrect, word.IntervalDays))
            {
                var autoRetireEnabled = await db.UserVocabularySettings
                    .Where(s => s.UserId == userId)
                    .Select(s => (bool?)s.AutoRetireEnabled)
                    .FirstOrDefaultAsync(ct) ?? true;
                if (autoRetireEnabled)
                {
                    word.IsRetired = true;
                    word.RetiredAt = now;
                    word.RetiredReason = "auto_3_correct_long_interval";
                }
            }
        }

        var baseReviewMode = srsEngine.GetReviewMode(prevStage, word.Sentence != null);
        db.VocabularyReviews.Add(new VocabularyReview
        {
            Id = Guid.NewGuid(),
            VocabularyWordId = word.Id,
            UserId = userId,
            SiteId = siteId,
            ReviewMode = isPractice ? "practice_" + baseReviewMode : baseReviewMode,
            IsCorrect = isCorrect,
            ResponseTimeMs = responseTimeMs,
            StageBefore = prevStage,
            StageAfter = newStage,
            CreatedAt = now,
        });

        await db.SaveChangesAsync(ct);

        // SRS-only path runs achievement checks. Practice rows still hit the
        // streak query (it scans VocabularyReviews) but skipping the checker
        // here prevents grinding "1000 reviews"-style achievements.
        if (!isPractice)
        {
            var streakMinMinutes = await StreakCalculator.GetStreakMinMinutes(db, userId, ct);
            var currentStreak = await StreakCalculator.CalculateStreak(db, userId, streakMinMinutes, now, ct);
            await new AchievementChecker(db).CheckAfterReview(userId, siteId, currentStreak, ct);
        }

        return new RecordedReview(
            word.Id, prevStage, newStage, newInterval, word.NextReviewAt, word.TotalReviews, word.CorrectReviews);
    }
}
