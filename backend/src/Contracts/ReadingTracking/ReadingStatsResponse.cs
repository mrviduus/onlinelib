namespace Contracts.ReadingTracking;

// Aggregate reading-stats response (R5 slice-3). Field names/order/types mirror the former
// anonymous object returned by ReadingTrackingEndpoints.GetStats byte-for-byte so the camelCase JSON
// is identical. Server-side SumAsync over int columns widens to `long` (each aggregate is cast
// `(long)` in the query), so the seconds/words totals are `long`; the two rounded averages are
// `double`. DailyGoal is null when the user has no active daily_minutes goal.
public record ReadingStatsResponse(
    long TotalSeconds,
    long TotalWords,
    int BooksFinished,
    int CurrentStreak,
    int LongestStreak,
    int StreakMinMinutes,
    double AvgDailyMinutes,
    double AvgWordsPerMinute,
    long TodaySeconds,
    int TodayVocabReviews,
    long WeekSeconds,
    long MonthSeconds,
    DailyGoalStatusDto? DailyGoal
);

// Nested daily-goal status. Mirrors the former inline anonymous object { target, today, met }:
// target is the goal's TargetValue (int), today is Round(effectiveMinutes, 1) (double), met is bool.
public record DailyGoalStatusDto(int Target, double Today, bool Met);
