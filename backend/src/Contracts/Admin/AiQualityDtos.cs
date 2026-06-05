namespace Contracts.Admin;

/// <summary>One day's total cost for a feature — drives the Summary sparkline.</summary>
public record DailyCostPoint(DateOnly Date, decimal CostUsd);

/// <summary>Per-feature observability rollup over the selected window (from llm_trace).</summary>
public record FeatureSummaryDto(
    string FeatureTag,
    long Calls,
    decimal CostUsd,
    decimal CostPerDay,
    int P50LatencyMs,
    int P95LatencyMs,
    double ErrorRate,
    long TokensIn,
    long TokensOut,
    IReadOnlyList<DailyCostPoint> DailyCost);

/// <summary>The /ai-quality Summary tab payload: window + totals + per-feature cards.</summary>
public record AiQualitySummaryDto(
    DateTimeOffset From,
    DateTimeOffset To,
    long TotalCalls,
    decimal TotalCostUsd,
    IReadOnlyList<FeatureSummaryDto> Features);
