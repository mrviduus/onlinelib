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

/// <summary>One row in the Traces tab table (lightweight; no prompt/response bodies).</summary>
public record TraceListItemDto(
    Guid Id,
    string FeatureTag,
    string ModelId,
    int TokensIn,
    int TokensOut,
    decimal CostUsd,
    int LatencyMs,
    bool HasError,
    DateTimeOffset CreatedAt);

/// <summary>Paged trace list for the Traces tab.</summary>
public record TracesPageDto(long Total, IReadOnlyList<TraceListItemDto> Items);

/// <summary>Full trace for the Traces drill-in (prompt/messages/response/tool calls).</summary>
public record TraceDetailDto(
    Guid Id,
    string FeatureTag,
    string ModelId,
    string? SystemPrompt,
    string MessagesJson,
    string? ResponseText,
    string? ToolCallsJson,
    int TokensIn,
    int TokensOut,
    decimal CostUsd,
    int LatencyMs,
    string? Error,
    Guid? UserId,
    DateTimeOffset CreatedAt);

/// <summary>One persisted eval run for the Evals tab history.</summary>
public record EvalRunDto(
    Guid Id,
    string Feature,
    string ModelId,
    string JudgeModelId,
    decimal Score,
    int N,
    string? BreakdownJson,
    string? GitSha,
    DateTimeOffset CreatedAt);
