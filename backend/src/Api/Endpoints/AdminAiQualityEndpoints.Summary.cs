using Contracts.Admin;
using Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static partial class AdminAiQualityEndpoints
{
    private static async Task<IResult> GetSummary(
        AppDbContext db,
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        [FromQuery] string? feature,
        CancellationToken ct)
    {
        var toUtc = to ?? DateTimeOffset.UtcNow;
        var fromUtc = from ?? toUtc.AddDays(-30);
        if (fromUtc >= toUtc)
            return Results.BadRequest(new { error = "'from' must be before 'to'" });
        var feat = string.IsNullOrWhiteSpace(feature) ? null : feature.Trim();
        var days = Math.Max(1.0, (toUtc - fromUtc).TotalDays);

        // Percentiles need percentile_cont (no EF translation), so this is raw SQL.
        // Column aliases MUST be snake_case: EF's SqlQuery<T> maps result columns to
        // row properties via the context's snake_case naming convention (e.g. property
        // CostUsd → column cost_usd). Quoted PascalCase aliases break that lookup.
        var rows = await db.Database.SqlQuery<FeatureRow>($"""
            SELECT feature_tag AS feature_tag,
                   count(*) AS calls,
                   coalesce(sum(cost_usd), 0) AS cost_usd,
                   count(*) FILTER (WHERE error IS NOT NULL) AS errors,
                   coalesce(sum(tokens_in), 0) AS tokens_in,
                   coalesce(sum(tokens_out), 0) AS tokens_out,
                   coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms), 0) AS p50,
                   coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0) AS p95
            FROM llm_traces
            WHERE created_at >= {fromUtc} AND created_at < {toUtc}
              AND ({feat}::text IS NULL OR feature_tag = {feat})
            GROUP BY feature_tag
            ORDER BY cost_usd DESC
            """).ToListAsync(ct);

        var daily = await db.Database.SqlQuery<DailyRow>($"""
            SELECT feature_tag AS feature_tag,
                   (date_trunc('day', created_at))::date AS day,
                   coalesce(sum(cost_usd), 0) AS cost_usd
            FROM llm_traces
            WHERE created_at >= {fromUtc} AND created_at < {toUtc}
              AND ({feat}::text IS NULL OR feature_tag = {feat})
            GROUP BY feature_tag, (date_trunc('day', created_at))::date
            ORDER BY day
            """).ToListAsync(ct);

        var dailyByFeature = daily
            .GroupBy(d => d.FeatureTag)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<DailyCostPoint>)g
                    .Select(d => new DailyCostPoint(DateOnly.FromDateTime(d.Day), d.CostUsd))
                    .ToList());

        // Latest eval score per feature (small table → fetch recent + group in memory).
        // Resilient: a missing/empty eval_runs must never break the trace summary.
        Dictionary<string, decimal> latestEval;
        try
        {
            var evalRows = await db.EvalRuns.OrderByDescending(r => r.CreatedAt).Take(500).ToListAsync(ct);
            latestEval = evalRows.GroupBy(r => r.Feature).ToDictionary(g => g.Key, g => g.First().Score);
        }
        catch
        {
            latestEval = [];
        }

        var features = rows.Select(r => new FeatureSummaryDto(
            FeatureTag: r.FeatureTag,
            Calls: r.Calls,
            CostUsd: r.CostUsd,
            CostPerDay: Math.Round(r.CostUsd / (decimal)days, 6),
            P50LatencyMs: (int)Math.Round(r.P50),
            P95LatencyMs: (int)Math.Round(r.P95),
            ErrorRate: r.Calls > 0 ? (double)r.Errors / r.Calls : 0,
            TokensIn: r.TokensIn,
            TokensOut: r.TokensOut,
            DailyCost: dailyByFeature.TryGetValue(r.FeatureTag, out var dc) ? dc : [],
            LatestEvalScore: latestEval.TryGetValue(r.FeatureTag, out var es) ? es : null))
            .ToList();

        var summary = new AiQualitySummaryDto(
            From: fromUtc,
            To: toUtc,
            TotalCalls: features.Sum(f => f.Calls),
            TotalCostUsd: features.Sum(f => f.CostUsd),
            Features: features);

        return Results.Ok(summary);
    }

    // Raw-SQL row shapes (mutable props + parameterless ctor for EF SqlQuery materialization).
    // MUST be public: EF's SqlQuery materializer can't construct private nested types
    // (fails only once rows exist), which 500'd the Summary on prod.
    public sealed class FeatureRow
    {
        public string FeatureTag { get; set; } = "";
        public long Calls { get; set; }
        public decimal CostUsd { get; set; }
        public long Errors { get; set; }
        public long TokensIn { get; set; }
        public long TokensOut { get; set; }
        public double P50 { get; set; }
        public double P95 { get; set; }
    }

    public sealed class DailyRow
    {
        public string FeatureTag { get; set; } = "";
        public DateTime Day { get; set; }
        public decimal CostUsd { get; set; }
    }
}
