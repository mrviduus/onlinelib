using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.Common.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static partial class ReadingTrackingEndpoints
{
    private static async Task<IResult> GetStats(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        [FromQuery] string? tz,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var tzOffset = ParseTzOffset(tz);
        var now = DateTimeOffset.UtcNow;

        var allSessions = db.ReadingSessions
            .Where(s => s.UserId == userId.Value);

        var totalSeconds = await allSessions.SumAsync(s => (long)s.DurationSeconds, ct);
        var totalWords = await allSessions.SumAsync(s => (long)s.WordsRead, ct);
        var sessionCount = await allSessions.CountAsync(ct);

        var booksFinished = await allSessions
            .Where(s => s.EndPercent >= 0.99)
            .Select(s => s.EditionId ?? s.UserBookId)
            .Distinct()
            .CountAsync(ct);

        // Time-period sums (calculate in user tz, convert to UTC for PostgreSQL)
        var todayLocal = GetDayStart(now, tzOffset);
        var todayStart = todayLocal.ToUniversalTime();
        var weekStart = todayLocal.AddDays(-(int)todayLocal.DayOfWeek).ToUniversalTime();
        var monthStart = new DateTimeOffset(todayLocal.Year, todayLocal.Month, 1, 0, 0, 0, tzOffset).ToUniversalTime();

        var todaySeconds = await allSessions
            .Where(s => s.StartedAt >= todayStart)
            .SumAsync(s => (long)s.DurationSeconds, ct);
        var weekSeconds = await allSessions
            .Where(s => s.StartedAt >= weekStart)
            .SumAsync(s => (long)s.DurationSeconds, ct);
        var monthSeconds = await allSessions
            .Where(s => s.StartedAt >= monthStart)
            .SumAsync(s => (long)s.DurationSeconds, ct);

        // Streak
        var streakMinMinutes = await GetStreakMinMinutes(db, userId.Value, siteId, ct);
        var currentStreak = await CalculateStreak(db, userId.Value, siteId, streakMinMinutes, now, ct, tzOffset);
        var longestStreak = await CalculateLongestStreak(db, userId.Value, siteId, streakMinMinutes, ct, tzOffset);

        // Averages
        double avgDailyMinutes = 0;
        double avgWordsPerMinute = 0;
        if (sessionCount > 0)
        {
            var firstSession = await allSessions
                .OrderBy(s => s.StartedAt)
                .Select(s => s.StartedAt)
                .FirstOrDefaultAsync(ct);
            var daysSinceFirst = Math.Max(1, (now - firstSession).TotalDays);
            avgDailyMinutes = totalSeconds / 60.0 / daysSinceFirst;

            if (totalSeconds > 0)
                avgWordsPerMinute = totalWords / (totalSeconds / 60.0);
        }

        // Vocab reviews today
        var todayVocabReviews = await db.VocabularyReviews
            .Where(r => r.UserId == userId.Value && r.CreatedAt >= todayStart)
            .CountAsync(ct);

        // Daily goal (reading + vocab reviews as effective minutes)
        var dailyGoal = await db.ReadingGoals
            .Where(g => g.UserId == userId.Value && g.GoalType == "daily_minutes" && g.IsActive)
            .FirstOrDefaultAsync(ct);

        object? dailyGoalObj = null;
        if (dailyGoal != null)
        {
            var effectiveTodayMinutes = todaySeconds / 60.0 + todayVocabReviews * 0.5;
            dailyGoalObj = new
            {
                target = dailyGoal.TargetValue,
                today = Math.Round(effectiveTodayMinutes, 1),
                met = effectiveTodayMinutes >= dailyGoal.TargetValue,
            };
        }

        return Results.Ok(new
        {
            totalSeconds,
            totalWords,
            booksFinished,
            currentStreak,
            longestStreak,
            streakMinMinutes,
            avgDailyMinutes = Math.Round(avgDailyMinutes, 1),
            avgWordsPerMinute = Math.Round(avgWordsPerMinute, 1),
            todaySeconds,
            todayVocabReviews,
            weekSeconds,
            monthSeconds,
            dailyGoal = dailyGoalObj,
        });
    }

    private static async Task<IResult> GetDailyStats(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        [FromQuery] string? tz,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var tzOffset = ParseTzOffset(tz);
        var now = DateTimeOffset.UtcNow;
        var start = from ?? now.AddDays(-90);
        var end = to ?? now;

        // Get raw sessions in range
        var sessions = await db.ReadingSessions
            .Where(s => s.UserId == userId.Value && s.StartedAt >= start && s.StartedAt <= end)
            .Select(s => new { s.StartedAt, s.DurationSeconds, s.WordsRead })
            .ToListAsync(ct);

        // Group by local date
        var daily = sessions
            .GroupBy(s => s.StartedAt.ToOffset(tzOffset).Date)
            .Select(g => new DailyStatDto(
                g.Key,
                g.Sum(s => s.DurationSeconds),
                g.Sum(s => s.WordsRead),
                g.Count()))
            .OrderBy(d => d.Date)
            .ToList();

        return Results.Ok(daily);
    }
}
