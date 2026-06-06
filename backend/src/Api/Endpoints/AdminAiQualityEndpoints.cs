using Application.Common.Interfaces;
using Contracts.Admin;
using Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;
using TextStack.Ai.EvalSuite;

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
        group.MapGet("/traces", GetTraces);
        group.MapGet("/traces/{id:guid}", GetTrace);
        group.MapGet("/evals", GetEvals);
        group.MapPost("/evals/run", RunEvals);
        group.MapGet("/evals/status", GetEvalStatus);
    }

    // In-app eval runner state (one run at a time). Triggered from the admin Evals tab.
    private static volatile bool _evalRunning;
    private static DateTimeOffset? _evalStartedAt;
    private static string? _evalLastError;
    private static readonly object _evalLock = new();

    private static IResult RunEvals(
        [FromBody] RunEvalsRequest? body,
        IServiceScopeFactory scopeFactory,
        IConfiguration config,
        ILogger<Program> logger)
    {
        lock (_evalLock)
        {
            if (_evalRunning)
                return Results.Conflict(new { error = "An eval run is already in progress" });
            _evalRunning = true;
            _evalStartedAt = DateTimeOffset.UtcNow;
            _evalLastError = null;
        }

        // Judge defaults to local Ollama (free); generation always goes through the
        // gateway (routes by FeatureTag → OpenAI/Ollama exactly like prod).
        var judgeKey = string.Equals(body?.Judge, "openai", StringComparison.OrdinalIgnoreCase) ? "openai" : "ollama";
        var judgeModelId = judgeKey == "openai"
            ? config["OpenAI:Model"] ?? "gpt-4.1-nano"
            : config["Ollama:Model"] ?? "gemma4:e4b";
        var gitSha = Environment.GetEnvironmentVariable("GIT_SHA");
        var features = body?.Features;

        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var sp = scope.ServiceProvider;
                var runner = sp.GetRequiredService<EvalSuiteRunner>();
                var gateway = sp.GetRequiredService<ILlmService>();
                var judge = sp.GetRequiredKeyedService<ILlmService>(judgeKey);
                var db = sp.GetRequiredService<IAppDbContext>();
                await runner.RunAsync(_ => gateway, judge, judgeModelId, features, persist: true, db, gitSha, CancellationToken.None);
            }
            catch (Exception ex)
            {
                _evalLastError = ex.Message;
                logger.LogError(ex, "Admin-triggered eval run failed");
            }
            finally
            {
                _evalRunning = false;
            }
        });

        return Results.Accepted(value: new { started = true });
    }

    private static IResult GetEvalStatus() =>
        Results.Ok(new EvalStatusDto(_evalRunning, _evalStartedAt, _evalLastError));

    private static async Task<IResult> GetTraces(
        AppDbContext db,
        [FromQuery] string? feature,
        [FromQuery] string? q,
        [FromQuery] int limit = 50,
        [FromQuery] int offset = 0,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 100);
        offset = Math.Max(offset, 0);

        var query = db.LlmTraces.AsQueryable();
        if (!string.IsNullOrWhiteSpace(feature))
            query = query.Where(t => t.FeatureTag == feature);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = $"%{q.Trim()}%";
            query = query.Where(t =>
                (t.SystemPrompt != null && EF.Functions.ILike(t.SystemPrompt, pattern)) ||
                (t.ResponseText != null && EF.Functions.ILike(t.ResponseText, pattern)));
        }

        var total = await query.LongCountAsync(ct);
        var items = await query
            .OrderByDescending(t => t.CreatedAt)
            .Skip(offset).Take(limit)
            .Select(t => new TraceListItemDto(
                t.Id, t.FeatureTag, t.ModelId, t.TokensIn, t.TokensOut,
                t.CostUsd, t.LatencyMs, t.Error != null, t.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(new TracesPageDto(total, items));
    }

    private static async Task<IResult> GetTrace(Guid id, AppDbContext db, CancellationToken ct)
    {
        var t = await db.LlmTraces.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t is null) return Results.NotFound();
        return Results.Ok(new TraceDetailDto(
            t.Id, t.FeatureTag, t.ModelId, t.SystemPrompt, t.MessagesJson, t.ResponseText,
            t.ToolCallsJson, t.TokensIn, t.TokensOut, t.CostUsd, t.LatencyMs, t.Error, t.UserId, t.CreatedAt));
    }

    private static async Task<IResult> GetEvals(
        AppDbContext db,
        [FromQuery] string? feature,
        [FromQuery] int limit = 200,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 1000);
        var query = db.EvalRuns.AsQueryable();
        if (!string.IsNullOrWhiteSpace(feature))
            query = query.Where(r => r.Feature == feature);

        var runs = await query
            .OrderByDescending(r => r.CreatedAt)
            .Take(limit)
            .Select(r => new EvalRunDto(
                r.Id, r.Feature, r.ModelId, r.JudgeModelId, r.Score, r.N, r.BreakdownJson, r.GitSha, r.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(runs);
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
