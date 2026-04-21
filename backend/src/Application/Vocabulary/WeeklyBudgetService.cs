using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Application.Vocabulary;

public record WeeklyProgress(int Used, int Budget, int Remaining, DateTimeOffset ResetAt);

// Anti-spiral F5: clamps daily review queue by a rolling 7d budget.
// Rolling (not ISO week) so Monday-resets can't be gamed by bunching reviews.
public class WeeklyBudgetService(IAppDbContext db)
{
    public const int DefaultWeeklyBudget = 70;

    public async Task<WeeklyProgress> GetProgressAsync(Guid userId, Guid siteId, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var since = now.AddDays(-7);

        var used = await db.VocabularyReviews
            .Where(r => r.UserId == userId && r.SiteId == siteId && r.CreatedAt >= since)
            .CountAsync(ct);

        var budget = await db.UserVocabularySettings
            .Where(s => s.UserId == userId && s.SiteId == siteId)
            .Select(s => (int?)s.WeeklyReviewBudget)
            .FirstOrDefaultAsync(ct) ?? DefaultWeeklyBudget;

        // ResetAt = oldest review in window rolls off → window opens up.
        // If no reviews in window, budget resets immediately (now).
        var oldestInWindow = await db.VocabularyReviews
            .Where(r => r.UserId == userId && r.SiteId == siteId && r.CreatedAt >= since)
            .OrderBy(r => r.CreatedAt)
            .Select(r => (DateTimeOffset?)r.CreatedAt)
            .FirstOrDefaultAsync(ct);

        return ComputeProgress(used, budget, oldestInWindow, now);
    }

    // Pure helper — testable without a DB. Caller supplies `now` so tests can
    // pin time without a TimeProvider shim.
    public static WeeklyProgress ComputeProgress(int used, int budget, DateTimeOffset? oldestReviewInWindow, DateTimeOffset now)
    {
        // ResetAt is when the window first frees up. With reviews in window,
        // it's when the oldest one rolls off. With no reviews, the window is
        // already empty — `now + 7d` is the soonest a notification scheduled
        // on this value could meaningfully fire. Returning `now` here would
        // cause "fire immediately" notifications on the client.
        var resetAt = oldestReviewInWindow.HasValue ? oldestReviewInWindow.Value.AddDays(7) : now.AddDays(7);
        return new WeeklyProgress(
            Used: used,
            Budget: budget,
            Remaining: Math.Max(0, budget - used),
            ResetAt: resetAt);
    }
}
