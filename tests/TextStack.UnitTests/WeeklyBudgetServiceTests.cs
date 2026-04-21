using Application.Vocabulary;

namespace TextStack.UnitTests;

public class WeeklyBudgetServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 4, 21, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void ComputeProgress_UnderBudget_RemainingMatchesDiff()
    {
        var progress = WeeklyBudgetService.ComputeProgress(used: 30, budget: 70, oldestReviewInWindow: null, now: Now);

        Assert.Equal(30, progress.Used);
        Assert.Equal(70, progress.Budget);
        Assert.Equal(40, progress.Remaining);
    }

    [Fact]
    public void ComputeProgress_OverBudget_RemainingClampedToZero()
    {
        // Over-budget can happen if the budget was lowered mid-week.
        var progress = WeeklyBudgetService.ComputeProgress(used: 85, budget: 70, oldestReviewInWindow: null, now: Now);

        Assert.Equal(0, progress.Remaining);
    }

    [Fact]
    public void ComputeProgress_AtBudget_RemainingZero()
    {
        var progress = WeeklyBudgetService.ComputeProgress(used: 70, budget: 70, oldestReviewInWindow: null, now: Now);

        Assert.Equal(0, progress.Remaining);
    }

    [Fact]
    public void ComputeProgress_NoReviewsInWindow_ResetsAtNowPlus7d()
    {
        var progress = WeeklyBudgetService.ComputeProgress(used: 0, budget: 70, oldestReviewInWindow: null, now: Now);

        // Window is empty; ResetAt is forward-dated so client-side notifications
        // scheduled on this value don't fire immediately.
        Assert.Equal(Now.AddDays(7), progress.ResetAt);
    }

    [Fact]
    public void ComputeProgress_WithOldestReview_ResetsAtOldestPlus7Days()
    {
        var oldest = Now.AddDays(-6);

        var progress = WeeklyBudgetService.ComputeProgress(used: 10, budget: 70, oldestReviewInWindow: oldest, now: Now);

        // Rolling window: the oldest review rolls off 7 days after it was made.
        Assert.Equal(oldest.AddDays(7), progress.ResetAt);
    }

    [Fact]
    public void ComputeProgress_DefaultBudgetConstant_Is70()
    {
        // Anti-spiral plan default. If this changes, update the DTO's default
        // and the shared TS constant too.
        Assert.Equal(70, WeeklyBudgetService.DefaultWeeklyBudget);
    }
}
