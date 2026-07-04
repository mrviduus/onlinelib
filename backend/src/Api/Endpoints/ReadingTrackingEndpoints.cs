using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

/// <summary>
/// Reading-tracking HTTP surface. Routes registered via <see cref="MapReadingTrackingEndpoints"/>;
/// handlers are split across partial files by sub-domain to keep each file reviewable:
///
///   - ReadingTrackingEndpoints.Sessions.cs      SubmitSession, GetSessions
///   - ReadingTrackingEndpoints.Stats.cs         GetStats, GetDailyStats
///   - ReadingTrackingEndpoints.Goals.cs         GetGoals, CreateOrUpdateGoal, DeleteGoal
///   - ReadingTrackingEndpoints.Achievements.cs  GetAchievements
///   - ReadingTrackingEndpoints.BookStats.cs     GetBookStats
///   - ReadingTrackingEndpoints.Summary.cs       GetLibrarySummary, GetPace
///
/// This file keeps the route table + shared streak/tz helpers + DTOs. Splits use C#
/// `partial` — compile-identical to the original monolithic file.
/// </summary>
public static partial class ReadingTrackingEndpoints
{
    public static void MapReadingTrackingEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/me/reading").WithTags("Reading Tracking");

        group.MapPost("/sessions", SubmitSession).WithName("SubmitReadingSession");
        group.MapGet("/sessions", GetSessions).WithName("GetReadingSessions");
        group.MapGet("/stats", GetStats).WithName("GetReadingStats");
        group.MapGet("/stats/daily", GetDailyStats).WithName("GetDailyReadingStats");
        group.MapGet("/goals", GetGoals).WithName("GetReadingGoals");
        group.MapPost("/goals", CreateOrUpdateGoal).WithName("CreateOrUpdateReadingGoal");
        group.MapDelete("/goals/{id:guid}", DeleteGoal).WithName("DeleteReadingGoal");
        group.MapGet("/achievements", GetAchievements).WithName("GetAchievements");
        group.MapGet("/book-stats", GetBookStats).WithName("GetBookStats");
        group.MapGet("/pace", GetPace).WithName("GetReadingPace");
        group.MapGet("/library-summary", GetLibrarySummary).WithName("GetLibrarySummary");
    }

    // --- Helpers ---

    private static TimeSpan ParseTzOffset(string? tz)
    {
        if (string.IsNullOrEmpty(tz)) return TimeSpan.Zero;
        if (int.TryParse(tz, out var minutes))
            return TimeSpan.FromMinutes(minutes);
        return TimeSpan.Zero;
    }

    private static DateTimeOffset GetDayStart(DateTimeOffset now, TimeSpan tzOffset)
    {
        var local = now.ToOffset(tzOffset);
        return new DateTimeOffset(local.Year, local.Month, local.Day, 0, 0, 0, tzOffset);
    }

    internal static async Task<int> GetStreakMinMinutes(IAppDbContext db, Guid userId, Guid siteId, CancellationToken ct)
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
        IAppDbContext db, Guid userId, Guid siteId,
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

    internal static async Task<int> CalculateStreak(
        IAppDbContext db, Guid userId, Guid siteId, int streakMinMinutes,
        DateTimeOffset now, CancellationToken ct, TimeSpan tzOffset = default)
    {
        var since = now.AddDays(-365);
        var daily = await GetDailyEffectiveSeconds(db, userId, siteId, since, tzOffset, ct);

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

    private static async Task<int> CalculateLongestStreak(
        IAppDbContext db, Guid userId, Guid siteId, int streakMinMinutes, CancellationToken ct, TimeSpan tzOffset = default)
    {
        var daily = await GetDailyEffectiveSeconds(db, userId, siteId, DateTimeOffset.MinValue, tzOffset, ct);

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

// DTOs
public record SubmitSessionRequest(
    Guid? EditionId,
    Guid? UserBookId,
    DateTimeOffset StartedAt,
    DateTimeOffset EndedAt,
    int DurationSeconds,
    int WordsRead,
    double StartPercent,
    double EndPercent
);

public record SubmitSessionResponse(Guid SessionId, List<string> NewAchievements);

public record SessionDto(
    Guid Id, Guid? EditionId, Guid? UserBookId,
    DateTimeOffset StartedAt, DateTimeOffset EndedAt,
    int DurationSeconds, int WordsRead,
    double StartPercent, double EndPercent
);

public record DailyStatDto(DateTime Date, int TotalSeconds, int TotalWords, int SessionCount);

public record GoalDto(Guid Id, string GoalType, int TargetValue, int Year, int StreakMinMinutes, DateTimeOffset UpdatedAt);

public record CreateGoalRequest(string GoalType, int TargetValue, int Year, int? StreakMinMinutes);

public record AchievementDto(string Code, DateTimeOffset UnlockedAt);

public record ReadingPaceDto(int Wpm, int SessionCount, bool IsUserSpecific);

public record GoalSummaryDto(string Type, int Current, int Target);
public record LibrarySummaryDto(
    int PagesThisMonth,
    int MinutesThisMonth,
    int CurrentStreak,
    int StreakMinMinutes,
    int BooksFinishedYtd,
    GoalSummaryDto? Goal
);

// Book Stats DTOs
public record BookStatsResponse(
    int BooksFinished,
    int TotalPages,
    double AvgDaysToFinish,
    List<GenreStatDto> GenreStats,
    List<AuthorStatDto> AuthorStats,
    List<LanguageStatDto> LanguageStats,
    List<BooksOverTimeDto> BooksOverTime,
    List<BookLengthBucketDto> BookLengthDistribution,
    List<PaceStatDto> PaceStats,
    List<ReadingTimeStatDto> ReadingTimeByGenre,
    List<ReadingTimeStatDto> ReadingTimeByAuthor,
    List<int> AvailableYears
);

public record GenreStatDto(string Name, string Slug, int Count);
public record AuthorStatDto(string Name, string Slug, int Count);
public record LanguageStatDto(string Language, int Count);
public record BooksOverTimeDto(string Period, int Books, int Pages);
public record BookLengthBucketDto(string Bucket, int Count);
public record PaceStatDto(string Pace, int Count);
public record ReadingTimeStatDto(string Name, string Slug, long Seconds);
