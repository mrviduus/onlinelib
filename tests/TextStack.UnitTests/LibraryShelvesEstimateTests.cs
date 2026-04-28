using Application.Library;

namespace TextStack.UnitTests;

public class LibraryShelvesEstimateTests
{
    [Fact]
    public void EstimateRemaining_NullWords_ReturnsNull()
    {
        Assert.Null(LibraryShelvesService.EstimateRemaining(null, 0.5, 200m));
    }

    [Fact]
    public void EstimateRemaining_ZeroWords_ReturnsNull()
    {
        Assert.Null(LibraryShelvesService.EstimateRemaining(0, 0.5, 200m));
    }

    [Fact]
    public void EstimateRemaining_PaceBelowSane_ReturnsNull()
    {
        Assert.Null(LibraryShelvesService.EstimateRemaining(20_000, 0.0, 10m));
    }

    [Fact]
    public void EstimateRemaining_FullProgress_ReturnsZero()
    {
        Assert.Equal(0, LibraryShelvesService.EstimateRemaining(20_000, 1.0, 200m));
    }

    [Fact]
    public void EstimateRemaining_HalfProgress_ReturnsHalf()
    {
        // 20_000 words * 0.5 left = 10_000; / 200 wpm = 50 min
        Assert.Equal(50, LibraryShelvesService.EstimateRemaining(20_000, 0.5, 200m));
    }

    [Fact]
    public void EstimateRemaining_ProgressClampedAbove1()
    {
        Assert.Equal(0, LibraryShelvesService.EstimateRemaining(20_000, 1.5, 200m));
    }

    [Fact]
    public void EstimateRemaining_ProgressClampedBelow0()
    {
        // negative progress → treated as 0 → full book
        Assert.Equal(100, LibraryShelvesService.EstimateRemaining(20_000, -0.5, 200m));
    }

    [Fact]
    public void EstimateRemaining_RoundsUp()
    {
        // 5_001 words * 1.0 left / 200 = 25.005 → 26
        Assert.Equal(26, LibraryShelvesService.EstimateRemaining(5_001, 0.0, 200m));
    }
}
