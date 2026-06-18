using TextStack.Ai.Llm;

namespace TextStack.UnitTests;

/// <summary>
/// Pure lookup behaviour for the cost-aware routing policy (Phase 12 RLOps slice 4):
/// feature → default → off precedence, DailyUsd absent/≤0 disables, mode resolution.
/// </summary>
public class BudgetOptionsTests
{
    private static BudgetOptions Build(BudgetMode defaultMode, params (string Feature, decimal? Daily, string? Fallback, BudgetMode Mode)[] features)
    {
        var dict = features.ToDictionary(
            f => f.Feature,
            f => new FeatureBudget(f.Daily, f.Fallback, f.Mode));
        return new BudgetOptions(new FeatureBudget(null, null, defaultMode), dict);
    }

    [Fact]
    public void Empty_AllOff_NoCaps()
    {
        var b = BudgetOptions.Empty;
        Assert.Equal(BudgetMode.Off, b.ModeFor("explain"));
        Assert.Null(b.DailyUsdFor("explain"));
        Assert.Null(b.FallbackKeyFor("explain"));
    }

    [Fact]
    public void ModeFor_KnownFeature_ReturnsFeatureMode()
    {
        var b = Build(BudgetMode.Off, ("explain", 5m, "ollama", BudgetMode.Fallback));
        Assert.Equal(BudgetMode.Fallback, b.ModeFor("explain"));
    }

    [Fact]
    public void ModeFor_UnknownFeature_InheritsDefaultMode()
    {
        var b = Build(BudgetMode.HardStop, ("explain", 5m, null, BudgetMode.Fallback));
        Assert.Equal(BudgetMode.HardStop, b.ModeFor("translate")); // unknown → default
        Assert.Equal(BudgetMode.HardStop, b.ModeFor(null));
    }

    [Fact]
    public void DailyUsdFor_PositiveCap_ReturnsCap()
    {
        var b = Build(BudgetMode.Off, ("explain", 12.50m, null, BudgetMode.HardStop));
        Assert.Equal(12.50m, b.DailyUsdFor("explain"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData(0.0)]
    [InlineData(-3.0)]
    public void DailyUsdFor_AbsentOrNonPositive_Disabled(double? raw)
    {
        decimal? daily = raw is null ? null : (decimal)raw.Value;
        var b = Build(BudgetMode.Off, ("explain", daily, null, BudgetMode.HardStop));
        Assert.Null(b.DailyUsdFor("explain"));
    }

    [Fact]
    public void DailyUsdFor_UnknownFeature_Null()
    {
        var b = Build(BudgetMode.Fallback, ("explain", 5m, null, BudgetMode.Fallback));
        Assert.Null(b.DailyUsdFor("translate")); // unknown never has a cap
    }

    [Fact]
    public void FallbackKeyFor_Whitespace_Null()
    {
        var b = Build(BudgetMode.Off, ("explain", 5m, "   ", BudgetMode.Fallback));
        Assert.Null(b.FallbackKeyFor("explain"));
    }

    [Fact]
    public void FallbackKeyFor_Configured_ReturnsKey()
    {
        var b = Build(BudgetMode.Off, ("explain", 5m, "ollama", BudgetMode.Fallback));
        Assert.Equal("ollama", b.FallbackKeyFor("explain"));
    }

    [Fact]
    public void ConfiguredFeatures_ReturnsExplicitKeys()
    {
        var b = Build(BudgetMode.Off,
            ("explain", 5m, null, BudgetMode.HardStop),
            ("translate", 2m, "ollama", BudgetMode.Fallback));
        Assert.Equal(new[] { "explain", "translate" }, b.ConfiguredFeatures.OrderBy(x => x).ToArray());
    }
}
