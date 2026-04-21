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
    public void DefaultDailyCap_Is15()
    {
        // Anti-spiral plan default. If this changes, update shared TS constant
        // and the UserVocabularySettings default too.
        Assert.Equal(15, DailyCapService.DefaultDailyCap);
    }
}
