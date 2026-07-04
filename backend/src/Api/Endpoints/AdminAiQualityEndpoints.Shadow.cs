using Contracts.Admin;
using Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static partial class AdminAiQualityEndpoints
{
    // Phase 12 (RLOps): per-pair shadow rollup. ONE GROUP BY (no N+1); percentile_cont +
    // the agreement averages have no EF translation → raw SQL. Snake_case aliases map onto
    // ShadowPairRow via the snake_case naming convention (PascalCase aliases break it).
    private static async Task<IResult> GetShadowSummary(
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
        var windowDays = (toUtc - fromUtc).TotalDays;

        var rows = await db.Database.SqlQuery<ShadowPairRow>($"""
            SELECT feature_tag AS feature_tag,
                   primary_model_id AS primary_model_id,
                   shadow_model_id AS shadow_model_id,
                   count(*) AS runs,
                   coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY primary_latency_ms), 0) AS primary_p50,
                   coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY shadow_latency_ms), 0)  AS shadow_p50,
                   coalesce(sum(primary_cost_usd),0) AS primary_cost_usd,
                   coalesce(sum(shadow_cost_usd),0)  AS shadow_cost_usd,
                   coalesce(sum(primary_tokens_out),0) AS primary_tokens_out,
                   coalesce(sum(shadow_tokens_out),0)  AS shadow_tokens_out,
                   avg((primary_response IS NOT NULL AND shadow_response IS NOT NULL AND primary_response = shadow_response)::int::float8) AS exact_match_rate,
                   avg(CASE WHEN primary_response IS NOT NULL AND shadow_response IS NOT NULL THEN length(shadow_response)::float8/nullif(length(primary_response),0) END) AS avg_length_ratio,
                   avg((primary_response IS NOT NULL AND shadow_response IS NOT NULL)::int::float8) AS both_present_rate,
                   min(created_at) AS first_seen,
                   max(created_at) AS last_seen
            FROM shadow_runs
            WHERE created_at >= {fromUtc} AND created_at < {toUtc}
              AND ({feat}::text IS NULL OR feature_tag = {feat})
            GROUP BY feature_tag, primary_model_id, shadow_model_id
            ORDER BY runs DESC
            """).ToListAsync(ct);

        var pairs = rows.Select(r => ToPairDto(r, windowDays)).ToList();

        var summary = new ShadowSummaryDto(
            From: fromUtc,
            To: toUtc,
            TotalRuns: pairs.Sum(p => p.Runs),
            Pairs: pairs);

        return Results.Ok(summary);
    }

    /// <summary>
    /// Pure mapper from a raw shadow-pair aggregate row → the DTO, computing all deltas
    /// (shadow − primary) and the 30-day cost projection. Extracted + public for unit testing.
    /// <paramref name="windowDays"/> is guarded to ≥1 so a sub-day window can't over-project.
    /// </summary>
    public static ShadowPairDto ToPairDto(ShadowPairRow r, double windowDays)
    {
        var days = Math.Max(1.0, windowDays);
        var primaryP50 = (int)Math.Round(r.PrimaryP50);
        var shadowP50 = (int)Math.Round(r.ShadowP50);
        var costDelta = r.ShadowCostUsd - r.PrimaryCostUsd;

        return new ShadowPairDto(
            FeatureTag: r.FeatureTag,
            PrimaryModelId: r.PrimaryModelId,
            ShadowModelId: r.ShadowModelId,
            Runs: r.Runs,
            PrimaryP50LatencyMs: primaryP50,
            ShadowP50LatencyMs: shadowP50,
            LatencyDeltaMs: shadowP50 - primaryP50,
            PrimaryCostUsd: r.PrimaryCostUsd,
            ShadowCostUsd: r.ShadowCostUsd,
            CostDeltaUsd: costDelta,
            ProjectedMonthlyCostDeltaUsd: costDelta * 30m / (decimal)days,
            PrimaryTokensOut: r.PrimaryTokensOut,
            ShadowTokensOut: r.ShadowTokensOut,
            TokensOutDelta: r.ShadowTokensOut - r.PrimaryTokensOut,
            ExactMatchRate: r.ExactMatchRate ?? 0,
            AvgLengthRatio: r.AvgLengthRatio ?? 0,
            BothPresentRate: r.BothPresentRate ?? 0,
            FirstSeen: r.FirstSeen,
            LastSeen: r.LastSeen);
    }

    // Phase 12 (RLOps): redacted side-by-side samples for one pair. Requires all three pair
    // keys (a sample list only makes sense within a single comparison). EF LINQ read, newest-first.
    private static async Task<IResult> GetShadowSamples(
        AppDbContext db,
        [FromQuery] string? feature,
        [FromQuery] string? primaryModelId,
        [FromQuery] string? shadowModelId,
        [FromQuery] int limit = 25,
        [FromQuery] int offset = 0,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(feature)
            || string.IsNullOrWhiteSpace(primaryModelId)
            || string.IsNullOrWhiteSpace(shadowModelId))
            return Results.BadRequest(
                new { error = "feature, primaryModelId and shadowModelId are all required" });

        limit = Math.Clamp(limit, 1, 50);
        offset = Math.Max(offset, 0);
        var feat = feature.Trim();
        var primary = primaryModelId.Trim();
        var shadow = shadowModelId.Trim();

        var query = db.ShadowRuns.Where(s =>
            s.FeatureTag == feat
            && s.PrimaryModelId == primary
            && s.ShadowModelId == shadow);

        var total = await query.LongCountAsync(ct);
        var items = await query
            .OrderByDescending(s => s.CreatedAt)
            .Skip(offset).Take(limit)
            .Select(s => new ShadowSampleDto(
                s.Id,
                s.PrimaryResponse,
                s.ShadowResponse,
                s.PrimaryLatencyMs,
                s.ShadowLatencyMs,
                s.PrimaryCostUsd,
                s.ShadowCostUsd,
                s.PrimaryTokensOut,
                s.ShadowTokensOut,
                s.PrimaryResponse != null && s.ShadowResponse != null && s.PrimaryResponse == s.ShadowResponse,
                s.PromptHash,
                s.PrimaryTraceId,
                s.ShadowTraceId,
                s.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(new ShadowSamplesPageDto(total, items));
    }

    /// <summary>Raw-SQL row for the shadow-pair aggregate (public + mutable for EF SqlQuery
    /// materialization, like FeatureRow). Avg columns are nullable — an all-null group yields NULL.</summary>
    public sealed class ShadowPairRow
    {
        public string FeatureTag { get; set; } = "";
        public string PrimaryModelId { get; set; } = "";
        public string ShadowModelId { get; set; } = "";
        public long Runs { get; set; }
        public double PrimaryP50 { get; set; }
        public double ShadowP50 { get; set; }
        public decimal PrimaryCostUsd { get; set; }
        public decimal ShadowCostUsd { get; set; }
        public long PrimaryTokensOut { get; set; }
        public long ShadowTokensOut { get; set; }
        public double? ExactMatchRate { get; set; }
        public double? AvgLengthRatio { get; set; }
        public double? BothPresentRate { get; set; }
        public DateTimeOffset FirstSeen { get; set; }
        public DateTimeOffset LastSeen { get; set; }
    }
}
