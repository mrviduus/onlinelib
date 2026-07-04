using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.Common.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Api.Endpoints;

public static partial class ReadingTrackingEndpoints
{
    // --- Reading Pace (slice 19) ---

    private const int PaceMinSessions = 3;
    private const int FallbackPaceWpm = 200;

    // --- Library Summary (slice 20) ---

    private static async Task<IResult> GetLibrarySummary(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        IMemoryCache cache,
        [FromQuery] string? tz,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var cacheKey = $"library-summary:{userId.Value}:{siteId}:{tz ?? "0"}";
        if (cache.TryGetValue<LibrarySummaryDto>(cacheKey, out var cached) && cached != null)
            return Results.Ok(cached);

        var tzOffset = ParseTzOffset(tz);
        var now = DateTimeOffset.UtcNow;
        var todayLocal = GetDayStart(now, tzOffset);
        var monthStart = new DateTimeOffset(todayLocal.Year, todayLocal.Month, 1, 0, 0, 0, tzOffset).ToUniversalTime();
        var yearStart = new DateTimeOffset(todayLocal.Year, 1, 1, 0, 0, 0, tzOffset).ToUniversalTime();

        var monthAgg = await db.ReadingSessions
            .Where(s => s.UserId == userId.Value && s.StartedAt >= monthStart)
            .GroupBy(_ => 1)
            .Select(g => new { Words = g.Sum(s => (long)s.WordsRead), Seconds = g.Sum(s => (long)s.DurationSeconds) })
            .FirstOrDefaultAsync(ct);

        var pagesThisMonth = (int)((monthAgg?.Words ?? 0) / 250);
        var minutesThisMonth = (int)((monthAgg?.Seconds ?? 0) / 60);

        var streakMinMinutes = await GetStreakMinMinutes(db, userId.Value, siteId, ct);
        var currentStreak = await CalculateStreak(db, userId.Value, siteId, streakMinMinutes, now, ct, tzOffset);

        var booksFinishedYtd = await db.ReadingSessions
            .Where(s => s.UserId == userId.Value && s.EndPercent >= 0.99 && s.EndedAt >= yearStart)
            .Select(s => s.EditionId ?? s.UserBookId)
            .Distinct()
            .CountAsync(ct);

        var dailyGoal = await db.ReadingGoals
            .Where(g => g.UserId == userId.Value && g.GoalType == "daily_minutes" && g.IsActive)
            .Select(g => new { g.TargetValue, g.StreakMinMinutes })
            .FirstOrDefaultAsync(ct);
        var yearlyGoal = await db.ReadingGoals
            .Where(g => g.UserId == userId.Value && g.GoalType == "books_per_year" && g.IsActive)
            .Select(g => new { g.TargetValue, g.Year })
            .FirstOrDefaultAsync(ct);

        GoalSummaryDto? goal = null;
        if (dailyGoal != null)
        {
            var todayStart = todayLocal.ToUniversalTime();
            var todaySeconds = await db.ReadingSessions
                .Where(s => s.UserId == userId.Value && s.StartedAt >= todayStart)
                .SumAsync(s => (long)s.DurationSeconds, ct);
            goal = new GoalSummaryDto("daily_minutes", (int)(todaySeconds / 60), dailyGoal.TargetValue);
        }
        else if (yearlyGoal != null)
        {
            goal = new GoalSummaryDto("books_per_year", booksFinishedYtd, yearlyGoal.TargetValue);
        }

        var dto = new LibrarySummaryDto(
            PagesThisMonth: pagesThisMonth,
            MinutesThisMonth: minutesThisMonth,
            CurrentStreak: currentStreak,
            StreakMinMinutes: streakMinMinutes,
            BooksFinishedYtd: booksFinishedYtd,
            Goal: goal
        );

        cache.Set(cacheKey, dto, TimeSpan.FromMinutes(5));
        return Results.Ok(dto);
    }

    private static async Task<IResult> GetPace(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        IMemoryCache cache,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var cacheKey = $"reading-pace:{userId.Value}:{siteId}";
        if (cache.TryGetValue<ReadingPaceDto>(cacheKey, out var cached) && cached != null)
            return Results.Ok(cached);

        var agg = await db.ReadingSessions
            .Where(s => s.UserId == userId.Value && s.WordsRead > 0 && s.DurationSeconds > 0)
            .GroupBy(_ => 1)
            .Select(g => new { Sessions = g.Count(), Words = g.Sum(s => (long)s.WordsRead), Seconds = g.Sum(s => (long)s.DurationSeconds) })
            .FirstOrDefaultAsync(ct);

        ReadingPaceDto dto;
        if (agg == null || agg.Sessions < PaceMinSessions || agg.Seconds <= 0)
        {
            dto = new ReadingPaceDto(FallbackPaceWpm, agg?.Sessions ?? 0, false);
        }
        else
        {
            var wpm = (int)Math.Round(agg.Words / (agg.Seconds / 60.0));
            // Clamp to sane range — guards against ultra-short sessions skewing avg
            wpm = Math.Clamp(wpm, 50, 800);
            dto = new ReadingPaceDto(wpm, agg.Sessions, true);
        }

        cache.Set(cacheKey, dto, TimeSpan.FromHours(1));
        return Results.Ok(dto);
    }
}
