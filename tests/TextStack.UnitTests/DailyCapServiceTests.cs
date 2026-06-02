using Application.Vocabulary;

namespace TextStack.UnitTests;

public class DailyCapServiceTests
{
    [Fact]
    public void Compute_UnderCap_RemainingMatchesDiff()
    {
        var status = DailyCapService.Compute(used: 5, cap: 15);

        Assert.Equal(5, status.Used);
        Assert.Equal(15, status.Cap);
        Assert.Equal(10, status.Remaining);
    }

    [Fact]
    public void Compute_AtCap_RemainingZero()
    {
        var status = DailyCapService.Compute(used: 15, cap: 15);

        Assert.Equal(0, status.Remaining);
    }

    [Fact]
    public void Compute_OverCap_RemainingClampedToZero()
    {
        // Over-cap is reachable when the user lowers DailyNewCap mid-day
        // after already activating N > newCap rows.
        var status = DailyCapService.Compute(used: 20, cap: 15);

        Assert.Equal(0, status.Remaining);
    }

    [Fact]
    public void Compute_ZeroCap_BlocksAllActivations()
    {
        // Cap=0 is a valid "pause new words" setting — keep it working.
        var status = DailyCapService.Compute(used: 0, cap: 0);

        Assert.Equal(0, status.Remaining);
    }

    [Fact]
    public void DefaultDailyCap_EqualsVocabularyCeiling_NoEffectiveDailyLimit()
    {
        // Daily cap is now opt-in: with no settings row the enforcement default
        // equals the per-user vocabulary ceiling (5000), so the daily gate never
        // binds before MaxWordsPerUser. The settings modal still SUGGESTS 15
        // (shared TS DEFAULT_DAILY_CAP) for users who choose to opt into a cap.
        Assert.Equal(5000, DailyCapService.DefaultDailyCap);
    }
}
