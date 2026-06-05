using Contracts.Admin;
using Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

/// <summary>
/// AI observability dashboard (AI-008, Summary tab). Aggregates the sampled
/// <c>llm_trace</c> rows into per-feature cost / latency (p50,p95) / error-rate /
/// volume over a time window. Admin-only via the AdminAuth middleware (all
/// <c>/admin/*</c>). Judge-score trends arrive once eval runs persist (AI-010).
/// </summary>
public static class AdminAiQualityEndpoints
{
    public static void MapAdminAiQualityEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/admin/ai-quality").WithTags("AI Quality");
        group.MapGet("/summary", GetSummary);
    }

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
        // Columns are quoted-aliased to match the row property names exactly.
        var rows = await db.Database.SqlQuery<FeatureRow>($"""
            SELECT feature_tag AS "FeatureTag",
                   count(*) AS "Calls",
                   coalesce(sum(cost_usd), 0) AS "CostUsd",
                   count(*) FILTER (WHERE error IS NOT NULL) AS "Errors",
                   coalesce(sum(tokens_in), 0) AS "TokensIn",
                   coalesce(sum(tokens_out), 0) AS "TokensOut",
                   coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms), 0) AS "P50",
                   coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0) AS "P95"
            FROM llm_traces
            WHERE created_at >= {fromUtc} AND created_at < {toUtc}
              AND ({feat}::text IS NULL OR feature_tag = {feat})
            GROUP BY feature_tag
            ORDER BY "CostUsd" DESC
            """).ToListAsync(ct);

        var daily = await db.Database.SqlQuery<DailyRow>($"""
            SELECT feature_tag AS "FeatureTag",
                   (date_trunc('day', created_at))::date AS "Day",
                   coalesce(sum(cost_usd), 0) AS "CostUsd"
            FROM llm_traces
            WHERE created_at >= {fromUtc} AND created_at < {toUtc}
              AND ({feat}::text IS NULL OR feature_tag = {feat})
            GROUP BY feature_tag, (date_trunc('day', created_at))::date
            ORDER BY "Day"
            """).ToListAsync(ct);

        var dailyByFeature = daily
            .GroupBy(d => d.FeatureTag)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<DailyCostPoint>)g
                    .Select(d => new DailyCostPoint(DateOnly.FromDateTime(d.Day), d.CostUsd))
                    .ToList());

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
            DailyCost: dailyByFeature.TryGetValue(r.FeatureTag, out var dc) ? dc : []))
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
    private sealed class FeatureRow
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

    private sealed class DailyRow
    {
        public string FeatureTag { get; set; } = "";
        public DateTime Day { get; set; }
        public decimal CostUsd { get; set; }
    }
}
