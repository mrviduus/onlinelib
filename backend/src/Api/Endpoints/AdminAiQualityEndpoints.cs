using Api.Middleware;
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
        group.MapGet("/agent-runs", GetAgentRuns);
        group.MapGet("/agent-runs/{id:guid}", GetAgentRun);
        group.MapGet("/evals", GetEvals);
        group.MapGet("/drift/eval-trend", GetEvalTrend);
        group.MapGet("/drift", GetDrift);
        group.MapPost("/evals/run", RunEvals);
        group.MapGet("/evals/status", GetEvalStatus);
        group.MapPost("/evals/toolcalls/run", RunToolCallEval);
        group.MapPost("/evals/studybuddy/run", RunStudyBuddyEval);
        group.MapPost("/evals/criticdefects/run", RunCriticDefectEval);
        group.MapPost("/evals/crew-ab/run", RunCrewAbEval);
        group.MapGet("/shadow/summary", GetShadowSummary);
        group.MapGet("/shadow/samples", GetShadowSamples);
        group.MapGet("/models", GetModels);
        group.MapPost("/models/{id:guid}/promote", PromoteModel);
        group.MapPost("/models/{feature}/rollback", RollbackModel);
        group.MapGet("/budgets", GetBudgets);
    }

    // Phase 7 DoD gate (AI-046): A/B the single-call baseline vs the full FieldCrew on the same brief+source over
    // the golden set, judged by an independent stronger judge (gpt-4.1). Reports crew lift % + cost ratio and
    // gates on lift ≥ 0.10 AND costRatio ≤ 2.0. Generation goes through the gateway (same nano for both arms);
    // the judge runs the dedicated openai-judge provider. ~30 gen + 20 judge calls, run sync like the others.
    private static async Task<IResult> RunCrewAbEval(
        HttpContext httpContext,
        IServiceProvider services,
        IConfiguration config,
        TextStack.Ai.EvalSuite.CrewAbEvalRunner runner,
        FieldCrew crew,
        IAppDbContext db,
        CancellationToken ct)
    {
        ILlmService gateway;
        try
        {
            gateway = services.GetRequiredService<ILlmService>();
        }
        catch (InvalidOperationException)
        {
            return Results.Problem("LLM gateway is not configured (no OpenAI key).", statusCode: 503);
        }

        ILlmService judge;
        try
        {
            judge = services.GetRequiredKeyedService<ILlmService>("openai-judge");
        }
        catch (InvalidOperationException)
        {
            return Results.Problem("Judge LLM is not configured.", statusCode: 503);
        }

        var judgeModelId = config["Eval:JudgeModel"] ?? "gpt-4.1";
        var baseline = new BaselineFieldAgent(gateway);
        var gitSha = Environment.GetEnvironmentVariable("GIT_SHA");

        var result = await runner.RunAsync(
            baseline, crew, judge, judgeModelId, persist: true, db, gitSha, ct);

        return Results.Ok(new
        {
            avgA = Math.Round(result.AvgA, 3),
            avgB = Math.Round(result.AvgB, 3),
            liftPct = Math.Round(result.LiftPct, 4),
            costRatio = double.IsPositiveInfinity(result.CostRatio) ? (double?)null : Math.Round(result.CostRatio, 3),
            winRate = Math.Round(result.WinRate, 3),
            n = result.N,
            passed = result.Passed,
            cases = result.Cases.Select(c => new
            {
                c.Id,
                scoreA = Math.Round(c.JudgeScoreA, 3),
                scoreB = Math.Round(c.JudgeScoreB, 3),
                c.CostA,
                c.CostB,
                c.BWins,
            }),
        });
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
        var judgeModelId = useOllama ? config["Ollama:Model"] ?? "gemma4:e2b" : config["Eval:JudgeModel"] ?? "gpt-4.1";

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
    // The single-slot guard is now the shared IEvalRunGate (slice 5a) so an admin run and a
    // scheduled ContinuousEvalWorker run can't collide; these fields are only display state.
    private static volatile bool _evalRunning;
    private static DateTimeOffset? _evalStartedAt;
    private static string? _evalLastError;

    private static IResult RunEvals(
        [FromBody] RunEvalsRequest? body,
        IServiceScopeFactory scopeFactory,
        IConfiguration config,
        Application.Ai.IEvalRunGate gate,
        ILogger<Program> logger)
    {
        if (!gate.TryEnter())
            return Results.Conflict(new { error = "An eval run is already in progress" });

        // The gate is now held; any synchronous failure before the background task's
        // finally takes over MUST release it, else evals are blocked until restart (QA P2).
        string judgeKey, judgeModelId;
        string? gitSha;
        IReadOnlyList<string>? features;
        try
        {
            _evalRunning = true;
            _evalStartedAt = DateTimeOffset.UtcNow;
            _evalLastError = null;

            // Judge defaults to local Ollama (free); generation always goes through the
            // gateway (routes by FeatureTag → OpenAI/Ollama exactly like prod).
            // The OpenAI judge runs the dedicated 'openai-judge' provider (Eval:JudgeModel,
            // default gpt-4.1) — stronger + independent of the nano generation model.
            var useOpenAiJudge = string.Equals(body?.Judge, "openai", StringComparison.OrdinalIgnoreCase);
            judgeKey = useOpenAiJudge ? "openai-judge" : "ollama";
            judgeModelId = useOpenAiJudge
                ? config["Eval:JudgeModel"] ?? "gpt-4.1"
                : config["Ollama:Model"] ?? "gemma4:e2b";
            gitSha = Environment.GetEnvironmentVariable("GIT_SHA");
            features = body?.Features;
        }
        catch
        {
            _evalRunning = false;
            gate.Exit();
            throw;
        }

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
                await runner.RunAsync(_ => gateway, judge, judgeModelId, features, persist: true, db, gitSha, CancellationToken.None, runType: "manual");
            }
            catch (Exception ex)
            {
                _evalLastError = ex.Message;
                logger.LogError(ex, "Admin-triggered eval run failed");
            }
            finally
            {
                _evalRunning = false;
                gate.Exit();
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

    // AI-045: list persisted agent_run rows for the admin transcript UI. Mirrors GetTraces
    // (newest-first, clamp, paged). The list projection omits StepsJson + Output (both big) and
    // truncates Goal. The `agent` filter matches exact OR prefix (so "crew." narrows to all crew
    // runs, "crew.autopublish"/"studybuddy" narrow to that one).
    private static async Task<IResult> GetAgentRuns(
        AppDbContext db,
        [FromQuery] string? agent,
        [FromQuery] int limit = 25,
        [FromQuery] int offset = 0,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 100);
        offset = Math.Max(offset, 0);

        var query = db.AgentRuns.AsQueryable();
        if (!string.IsNullOrWhiteSpace(agent))
        {
            var a = agent.Trim();
            query = query.Where(r => r.Agent == a || r.Agent.StartsWith(a));
        }

        var total = await query.LongCountAsync(ct);
        var rows = await query
            .OrderByDescending(r => r.CreatedAt)
            .Skip(offset).Take(limit)
            .Select(r => new
            {
                r.Id,
                r.Agent,
                r.UserId,
                r.EditionId,
                r.Status,
                r.Goal,
                r.Iterations,
                r.TokensIn,
                r.TokensOut,
                r.CostUsd,
                r.LatencyMs,
                HasError = r.Error != null && r.Error != "",
                r.CreatedAt,
            })
            .ToListAsync(ct);

        var items = rows.Select(r => new AgentRunListItemDto(
            r.Id, r.Agent, r.UserId, r.EditionId, r.Status,
            r.Goal.Length > 120 ? r.Goal[..120] : r.Goal,
            r.Iterations, r.TokensIn, r.TokensOut, r.CostUsd, r.LatencyMs,
            r.HasError, r.CreatedAt)).ToList();

        return Results.Ok(new AgentRunsPageDto(total, items));
    }

    // AI-045: full transcript for one agent run (StepsJson shipped RAW; frontend parses).
    private static async Task<IResult> GetAgentRun(Guid id, AppDbContext db, CancellationToken ct)
    {
        var r = await db.AgentRuns.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (r is null) return Results.NotFound();
        return Results.Ok(new AgentRunDetailDto(
            r.Id, r.Agent, r.UserId, r.EditionId, r.Status, r.Goal, r.Output, r.StepsJson,
            r.Iterations, r.TokensIn, r.TokensOut, r.CostUsd, r.LatencyMs, r.Error, r.CreatedAt));
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
                r.Id, r.Feature, r.ModelId, r.JudgeModelId, r.Score, r.N, r.BreakdownJson, r.GitSha, r.RunType, r.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(runs);
    }

    // Phase 12 RLOps slice 5a: scheduled-only eval trend for the Drift tab (slice 5b UI).
    // Last N RunType='scheduled' rows (optionally per feature), newest-first.
    private static async Task<IResult> GetEvalTrend(
        AppDbContext db,
        [FromQuery] string? feature,
        [FromQuery] int limit = 100,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 1000);
        var query = db.EvalRuns.Where(r => r.RunType == "scheduled");
        if (!string.IsNullOrWhiteSpace(feature))
        {
            var feat = feature.Trim();
            query = query.Where(r => r.Feature == feat);
        }

        var points = await query
            .OrderByDescending(r => r.CreatedAt)
            .Take(limit)
            .Select(r => new ScheduledEvalPointDto(
                r.Feature, r.ModelId, (double)r.Score, r.N, r.GitSha ?? "", r.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok((IReadOnlyList<ScheduledEvalPointDto>)points);
    }

    // Phase 12 RLOps slice 5b: per-day input-drift series for the Drift tab. drift_centroids rows
    // (optional feature filter), Day >= today-days, oldest-first for charting. Never returns the
    // raw centroid vectors. Admin-auth inherited from the /admin/* middleware.
    private static async Task<IResult> GetDrift(
        AppDbContext db,
        [FromQuery] string? feature,
        [FromQuery] int days = 30,
        CancellationToken ct = default)
    {
        days = Math.Clamp(days, 1, 365);
        var since = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-days);

        var query = db.DriftCentroids.Where(d => d.Day >= since);
        if (!string.IsNullOrWhiteSpace(feature))
        {
            var feat = feature.Trim();
            query = query.Where(d => d.Feature == feat);
        }

        var points = await query
            .OrderBy(d => d.Day)
            .Select(d => new DriftPointDto(d.Feature, d.Day, d.DriftScore, d.SampleSize, d.AlertState))
            .ToListAsync(ct);

        return Results.Ok((IReadOnlyList<DriftPointDto>)points);
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

    // Phase 12 (RLOps): the whole models registry (tiny table). Project to memory first,
    // then Status.ToString() — the stored-string enum has no in-query .ToString() translation.
    private static async Task<IResult> GetModels(AppDbContext db, CancellationToken ct)
    {
        var rows = await db.Models
            .OrderBy(m => m.FeatureTag).ThenBy(m => m.Status)
            .Select(m => new { m.Id, m.FeatureTag, m.ProviderKey, m.ModelId, m.Status, m.CreatedAt })
            .ToListAsync(ct);

        var models = rows.Select(m => new ModelRegistrationDto(
            m.Id, m.FeatureTag, m.ProviderKey, m.ModelId, m.Status.ToString(), m.CreatedAt)).ToList();

        return Results.Ok(new ModelsRegistryDto(models));
    }

    // Phase 12 (RLOps): make a Shadow registration the new Primary for its feature, demoting
    // the current Primary to Shadow + writing an audit row, in one transaction. Service throws
    // DomainException (→400 for not-found/Retired/already-Primary) or ConflictException (→409 for
    // a concurrent promote), both mapped by the ExceptionMiddleware. AdminUserId is audited.
    private static async Task<IResult> PromoteModel(
        Guid id,
        HttpContext httpContext,
        Application.Ai.ModelPromotionService service,
        CancellationToken ct)
    {
        var adminId = httpContext.GetAdminUserId();
        var result = await service.PromoteAsync(id, adminId, ct);
        return Results.Ok(ToDto(result));
    }

    // Phase 12 (RLOps): revert the most recent promotion for a feature (the demoted model becomes
    // Primary again). 409 (ConflictException) if there's no prior promotion to roll back.
    private static async Task<IResult> RollbackModel(
        string feature,
        HttpContext httpContext,
        Application.Ai.ModelPromotionService service,
        CancellationToken ct)
    {
        var adminId = httpContext.GetAdminUserId();
        var result = await service.RollbackAsync(feature, adminId, ct);
        return Results.Ok(ToDto(result));
    }

    // Phase 12 (RLOps slice 4): per-feature daily budget status. Display reads the live in-memory
    // ISpendTracker (NOT the sampled traces — those undercount). The feature set = every explicitly
    // budgeted feature UNION every feature with a configured route (Ai:Routes), so the tab shows
    // routed features even before they have a budget. Budgets are OFF by default → all rows show
    // mode "off", $0 budget, 0% used.
    private static IResult GetBudgets(
        ISpendTracker tracker,
        TextStack.Ai.Llm.BudgetOptions budgets,
        IConfiguration config)
    {
        var features = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var f in budgets.ConfiguredFeatures)
            features.Add(f);
        foreach (var route in config.GetSection("Ai:Routes").GetChildren())
            features.Add(route.Key);

        var rows = features.Select(f =>
        {
            var dailyBudget = budgets.DailyUsdFor(f);
            var mode = budgets.ModeFor(f);
            // Only read the tracker (which lazily seeds a DB sum) for features actually under a
            // budget — a read-only display endpoint must not seed/touch buckets for every routed
            // feature on each page load (QA P2). Unbudgeted features report $0/off without a hit.
            var enforced = mode != TextStack.Ai.Llm.BudgetMode.Off && dailyBudget is { } d && d > 0m;
            var spend = enforced ? tracker.SpentTodayUsd(f) : 0m;
            var pctUsed = dailyBudget is { } b && b > 0m ? (double)(spend / b) : 0d;
            var inFallback = mode == TextStack.Ai.Llm.BudgetMode.Fallback
                && dailyBudget is { } db && spend >= db;

            return new BudgetStatusDto(
                FeatureTag: f,
                TodaySpendUsd: spend,
                DailyBudgetUsd: dailyBudget,
                PctUsed: pctUsed,
                Mode: mode.ToString().ToLowerInvariant(),
                FallbackKey: budgets.FallbackKeyFor(f),
                InFallback: inFallback);
        }).ToList();

        return Results.Ok((IReadOnlyList<BudgetStatusDto>)rows);
    }

    private static ModelPromotionResultDto ToDto(Application.Ai.ModelPromotionResult r) =>
        new(
            r.FeatureTag,
            new ModelRegistrationDto(
                r.NewPrimary.Id, r.NewPrimary.FeatureTag, r.NewPrimary.ProviderKey,
                r.NewPrimary.ModelId, r.NewPrimary.Status.ToString(), r.NewPrimary.CreatedAt),
            r.DemotedToShadow is null ? null : new ModelRegistrationDto(
                r.DemotedToShadow.Id, r.DemotedToShadow.FeatureTag, r.DemotedToShadow.ProviderKey,
                r.DemotedToShadow.ModelId, r.DemotedToShadow.Status.ToString(), r.DemotedToShadow.CreatedAt),
            r.Action.ToString(),
            r.AdminUserId,
            r.CreatedAt);

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
