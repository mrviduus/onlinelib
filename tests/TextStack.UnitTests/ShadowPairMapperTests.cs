using Api.Endpoints;

namespace TextStack.UnitTests;

/// <summary>
/// Unit tests for the pure shadow-pair mapper (AdminAiQualityEndpoints.ToPairDto) — the delta +
/// 30-day projection math that the shadow Summary endpoint applies after SQL aggregation.
/// </summary>
public class ShadowPairMapperTests
{
    private static AdminAiQualityEndpoints.ShadowPairRow Row(
        double primaryP50 = 100,
        double shadowP50 = 150,
        decimal primaryCost = 1.0m,
        decimal shadowCost = 2.0m,
        long primaryTokensOut = 1000,
        long shadowTokensOut = 1200,
        double? exactMatch = 0.5,
        double? lengthRatio = 1.1,
        double? bothPresent = 0.9,
        long runs = 10) => new()
        {
            FeatureTag = "explain",
            PrimaryModelId = "gpt-4.1-mini",
            ShadowModelId = "gpt-4.1-nano",
            Runs = runs,
            PrimaryP50 = primaryP50,
            ShadowP50 = shadowP50,
            PrimaryCostUsd = primaryCost,
            ShadowCostUsd = shadowCost,
            PrimaryTokensOut = primaryTokensOut,
            ShadowTokensOut = shadowTokensOut,
            ExactMatchRate = exactMatch,
            AvgLengthRatio = lengthRatio,
            BothPresentRate = bothPresent,
            FirstSeen = DateTimeOffset.UnixEpoch,
            LastSeen = DateTimeOffset.UnixEpoch.AddDays(1),
        };

    [Fact]
    public void ToPairDto_Deltas_AreShadowMinusPrimary()
    {
        var dto = AdminAiQualityEndpoints.ToPairDto(
            Row(primaryP50: 100, shadowP50: 150, primaryCost: 1.0m, shadowCost: 2.5m,
                primaryTokensOut: 1000, shadowTokensOut: 1200),
            windowDays: 30);

        Assert.Equal(50, dto.LatencyDeltaMs);       // 150 - 100
        Assert.Equal(1.5m, dto.CostDeltaUsd);       // 2.5 - 1.0
        Assert.Equal(200, dto.TokensOutDelta);      // 1200 - 1000
    }

    [Fact]
    public void ToPairDto_NegativeDeltas_WhenShadowCheaperAndFaster()
    {
        var dto = AdminAiQualityEndpoints.ToPairDto(
            Row(primaryP50: 200, shadowP50: 120, primaryCost: 3.0m, shadowCost: 1.0m,
                primaryTokensOut: 1500, shadowTokensOut: 1000),
            windowDays: 30);

        Assert.Equal(-80, dto.LatencyDeltaMs);
        Assert.Equal(-2.0m, dto.CostDeltaUsd);
        Assert.Equal(-500, dto.TokensOutDelta);
    }

    [Fact]
    public void ToPairDto_Projection_ScalesWindowTo30Days()
    {
        // 15-day window, cost delta of 1.0 → 30-day projection doubles it.
        var dto = AdminAiQualityEndpoints.ToPairDto(
            Row(primaryCost: 0m, shadowCost: 1.0m), windowDays: 15);

        Assert.Equal(2.0m, dto.ProjectedMonthlyCostDeltaUsd);
    }

    [Fact]
    public void ToPairDto_Projection_30DayWindow_IsIdentity()
    {
        var dto = AdminAiQualityEndpoints.ToPairDto(
            Row(primaryCost: 1.0m, shadowCost: 2.0m), windowDays: 30);

        Assert.Equal(1.0m, dto.CostDeltaUsd);
        Assert.Equal(1.0m, dto.ProjectedMonthlyCostDeltaUsd);
    }

    [Fact]
    public void ToPairDto_WindowDaysGuard_SubDayWindow_DoesNotOverProject()
    {
        // 0.1-day window must clamp to 1 day, so projection = costDelta * 30, not * 300.
        var dto = AdminAiQualityEndpoints.ToPairDto(
            Row(primaryCost: 0m, shadowCost: 1.0m), windowDays: 0.1);

        Assert.Equal(30m, dto.ProjectedMonthlyCostDeltaUsd);
    }

    [Fact]
    public void ToPairDto_WindowDaysGuard_Zero_DoesNotDivideByZero()
    {
        var dto = AdminAiQualityEndpoints.ToPairDto(
            Row(primaryCost: 0m, shadowCost: 2.0m), windowDays: 0);

        Assert.Equal(60m, dto.ProjectedMonthlyCostDeltaUsd); // clamped to 1 day → *30
    }

    [Fact]
    public void ToPairDto_NullAgreementMetrics_DefaultToZero()
    {
        var dto = AdminAiQualityEndpoints.ToPairDto(
            Row(exactMatch: null, lengthRatio: null, bothPresent: null),
            windowDays: 30);

        Assert.Equal(0, dto.ExactMatchRate);
        Assert.Equal(0, dto.AvgLengthRatio);
        Assert.Equal(0, dto.BothPresentRate);
    }

    [Fact]
    public void ToPairDto_RoundsP50DoublesToInt()
    {
        var dto = AdminAiQualityEndpoints.ToPairDto(
            Row(primaryP50: 100.4, shadowP50: 150.6), windowDays: 30);

        Assert.Equal(100, dto.PrimaryP50LatencyMs);
        Assert.Equal(151, dto.ShadowP50LatencyMs);
        Assert.Equal(51, dto.LatencyDeltaMs); // 151 - 100 (rounded values)
    }

    [Fact]
    public void ToPairDto_PassesThroughIdentityFields()
    {
        var dto = AdminAiQualityEndpoints.ToPairDto(Row(runs: 42), windowDays: 30);

        Assert.Equal("explain", dto.FeatureTag);
        Assert.Equal("gpt-4.1-mini", dto.PrimaryModelId);
        Assert.Equal("gpt-4.1-nano", dto.ShadowModelId);
        Assert.Equal(42, dto.Runs);
        Assert.Equal(DateTimeOffset.UnixEpoch, dto.FirstSeen);
        Assert.Equal(DateTimeOffset.UnixEpoch.AddDays(1), dto.LastSeen);
    }
}
