using Application.Common.Interfaces;
using Contracts.Admin;
using Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;
using Application.Agents;
using TextStack.Ai.EvalSuite;
using TextStack.Ai.Tools;

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
        group.MapPost("/evals/toolcalls/run", RunToolCallEval);
        group.MapPost("/evals/studybuddy/run", RunStudyBuddyEval);
        group.MapPost("/evals/criticdefects/run", RunCriticDefectEval);
    }

    // Phase 7 DoD gate (AI-044): inject KNOWN defects into clean drafts, run the REAL AI-041 critic (nano)
    // over each, and measure per-axis + overall catch-rate vs the ≥0.80 gate plus a clean-control
    // false-positive rate. Deterministic injection + scoring; ~23 nano calls, run sync like the others.
    private static async Task<IResult> RunCriticDefectEval(
        IServiceProvider services,
        CriticDefectEvalRunner runner,
        IAppDbContext db,
        CancellationToken ct)
    {
        ILlmService llm;
        try
        {
            llm = services.GetRequiredService<ILlmService>();
        }
        catch (InvalidOperationException)
        {
            return Results.Problem("LLM gateway is not configured (no OpenAI key).", statusCode: 503);
        }

        var critic = new CriticAgent(llm);
        var gitSha = Environment.GetEnvironmentVariable("GIT_SHA");
        var result = await runner.RunAsync(critic, persist: true, db, gitSha, ct);

        return Results.Ok(new
        {
            catchRate = Math.Round(result.CatchRate, 4),
            falsePositiveRate = Math.Round(result.FalsePositiveRate, 4),
            n = result.N,
            passed = result.Passed,
            cases = result.Cases.Select(c => new
            {
                c.Id,
                c.DefectType,
                expectedAxis = c.ExpectedAxis ?? "(clean control)",
                c.Caught,
                c.Flagged,
                c.ParseFailed,
            }),
        });
    }

    // Phase 6 DoD gate (AI-039): runs the Study Buddy agent over the golden passages against a real
    // edition and scores the answers + records steps/cost. Needs an embedded edition (DDIA) + a key.
    private static async Task<IResult> RunStudyBuddyEval(
        [FromQuery] Guid editionId,
        [FromQuery] string? judge,
        HttpContext httpContext,
        IServiceProvider services,
        IConfiguration config,
        StudyBuddyEvalRunner runner,
        StudyBuddyAgent agent,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (editionId == Guid.Empty)
            return Results.BadRequest(new { error = "editionId query parameter is required." });

        var useOllama = string.Equals(judge, "ollama", StringComparison.OrdinalIgnoreCase);
        var judgeKey = useOllama ? "ollama" : "openai-judge";
        var judgeModelId = useOllama ? config["Ollama:Model"] ?? "gemma4:e4b" : config["Eval:JudgeModel"] ?? "gpt-4.1";

        ILlmService judgeClient;
        try
        {
            judgeClient = services.GetRequiredKeyedService<ILlmService>(judgeKey);
        }
        catch (InvalidOperationException)
        {
            return Results.Problem("Judge LLM is not configured.", statusCode: 503);
        }

        var gitSha = Environment.GetEnvironmentVariable("GIT_SHA");
        // The agent's tools resolve scoped services (db, retrieval) from the request scope.
        var result = await runner.RunAsync(
            agent, judgeClient, judgeModelId, editionId, userId: null, httpContext.RequestServices,
            persist: true, db, gitSha, ct);

        return Results.Ok(new
        {
            judgeScore = Math.Round(result.JudgeScore, 3),
            avgSteps = Math.Round(result.AvgSteps, 2),
            avgCostUsd = result.AvgCostUsd,
            n = result.N,
            cases = result.Cases.Select(c => new
            {
                passage = c.Passage.Length > 80 ? c.Passage[..80] + "…" : c.Passage,
                c.Steps,
                c.CostUsd,
                c.JudgeScore,
                c.Completed,
                c.OfferedTools,
            }),
        });
    }

    // Phase 5 DoD gate (AI-033): deterministic tool-call accuracy over the embedded golden set.
    // Round-1 only (tools are never executed) → no edition/user needed; ~30 nano calls, run sync.
    private static async Task<IResult> RunToolCallEval(
        IServiceProvider services,
        ToolCallEvalRunner runner,
        IToolRegistry registry,
        IAppDbContext db,
        CancellationToken ct)
    {
        ILlmService llm;
        try
        {
            llm = services.GetRequiredService<ILlmService>();
        }
        catch (InvalidOperationException)
        {
            return Results.Problem("LLM gateway is not configured (no OpenAI key).", statusCode: 503);
        }

        var gitSha = Environment.GetEnvironmentVariable("GIT_SHA");
        var result = await runner.RunAsync(llm, registry, persist: true, db, gitSha, ct);

        return Results.Ok(new
        {
            accuracy = Math.Round(result.Accuracy, 4),
            n = result.N,
            cases = result.Cases.Select(c => new
            {
                c.Word,
                expected = c.ExpectedTool ?? "(no tool)",
                actual = c.ActualTools,
                c.Hit,
            }),
        });
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
        // The OpenAI judge runs the dedicated 'openai-judge' provider (Eval:JudgeModel,
        // default gpt-4.1) — stronger + independent of the nano generation model.
        var useOpenAiJudge = string.Equals(body?.Judge, "openai", StringComparison.OrdinalIgnoreCase);
        var judgeKey = useOpenAiJudge ? "openai-judge" : "ollama";
        var judgeModelId = useOpenAiJudge
            ? config["Eval:JudgeModel"] ?? "gpt-4.1"
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
