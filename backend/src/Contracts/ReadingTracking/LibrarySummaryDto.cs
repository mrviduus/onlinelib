namespace Contracts.ReadingTracking;

// Reading-pace + library-summary DTOs (R5 slice-3). Moved verbatim from Api.Endpoints so they live
// beside the ReadingStatsService that produces them. Field names/casing/order unchanged.
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
