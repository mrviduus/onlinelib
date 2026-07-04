using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Application.ReadingTracking;

/// <summary>
/// Reading-streak + local-day helpers (R5 slice-3). Moved verbatim from the former
/// <c>ReadingTrackingEndpoints</c> static helpers so the streak logic is reachable from both the
/// <see cref="ReadingStatsService"/> and the achievement-award paths (session + vocab review) without
/// leaking EF query composition into the Api layer. Behaviour is byte-identical: the dead
/// <c>siteId</c> parameter (site scope is enforced by the R1b EF query filter, never read here) was
/// dropped, otherwise every aggregation and threshold is preserved.
/// </summary>
public static class StreakCalculator
{
    public static DateTimeOffset GetDayStart(DateTimeOffset now, TimeSpan tzOffset)
    {
        var local = now.ToOffset(tzOffset);
        return new DateTimeOffset(local.Year, local.Month, local.Day, 0, 0, 0, tzOffset);
    }

    public static async Task<int> GetStreakMinMinutes(IAppDbContext db, Guid userId, CancellationToken ct)
    {
        var goal = await db.ReadingGoals
            .Where(g => g.UserId == userId && g.GoalType == "daily_minutes" && g.IsActive)
            .Select(g => (int?)g.StreakMinMinutes)
            .FirstOrDefaultAsync(ct);
        return goal ?? 5;
    }

    /// Combines reading sessions + vocab reviews into effective seconds per local date.
    /// Each vocab review counts as 30 equivalent seconds (0.5 min).
    private static async Task<Dictionary<DateTime, int>> GetDailyEffectiveSeconds(
        IAppDbContext db, Guid userId,
        DateTimeOffset since, TimeSpan tzOffset, CancellationToken ct)
    {
        var sessions = await db.ReadingSessions
            .Where(s => s.UserId == userId && s.StartedAt >= since)
            .Select(s => new { s.StartedAt, s.DurationSeconds })
            .ToListAsync(ct);

        var daily = sessions
            .GroupBy(s => s.StartedAt.ToOffset(tzOffset).Date)
            .ToDictionary(g => g.Key, g => g.Sum(s => s.DurationSeconds));

        var reviews = await db.VocabularyReviews
            .Where(r => r.UserId == userId && r.CreatedAt >= since)
            .Select(r => r.CreatedAt)
            .ToListAsync(ct);

        foreach (var g in reviews.GroupBy(r => r.ToOffset(tzOffset).Date))
        {
            daily.TryGetValue(g.Key, out var existing);
            daily[g.Key] = existing + g.Count() * 30;
        }

        return daily;
    }

    public static async Task<int> CalculateStreak(
        IAppDbContext db, Guid userId, int streakMinMinutes,
        DateTimeOffset now, CancellationToken ct, TimeSpan tzOffset = default)
    {
        var since = now.AddDays(-365);
        var daily = await GetDailyEffectiveSeconds(db, userId, since, tzOffset, ct);

        if (daily.Count == 0) return 0;

        var thresholdSeconds = streakMinMinutes * 60;
        var qualifyingDates = daily
            .Where(d => d.Value >= thresholdSeconds)
            .Select(d => d.Key)
            .ToHashSet();

        var today = now.ToOffset(tzOffset).Date;
        var streak = 0;
        var checkDate = today;

        // If today doesn't qualify, start from yesterday
        if (!qualifyingDates.Contains(checkDate))
            checkDate = checkDate.AddDays(-1);

        while (qualifyingDates.Contains(checkDate))
        {
            streak++;
            checkDate = checkDate.AddDays(-1);
        }

        return streak;
    }

    public static async Task<int> CalculateLongestStreak(
        IAppDbContext db, Guid userId, int streakMinMinutes, CancellationToken ct, TimeSpan tzOffset = default)
    {
        var daily = await GetDailyEffectiveSeconds(db, userId, DateTimeOffset.MinValue, tzOffset, ct);

        if (daily.Count == 0) return 0;

        var thresholdSeconds = streakMinMinutes * 60;
        var sorted = daily.Where(d => d.Value >= thresholdSeconds).Select(d => d.Key).OrderBy(d => d).ToList();

        if (sorted.Count == 0) return 0;

        var longest = 1;
        var current = 1;

        for (var i = 1; i < sorted.Count; i++)
        {
            if ((sorted[i] - sorted[i - 1]).Days == 1)
                current++;
            else
                current = 1;

            if (current > longest) longest = current;
        }

        return longest;
    }
}
