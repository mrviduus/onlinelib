using Api.Extensions;
using Api.Sites;
using Application.Agents;
using Application.Auth;
using Application.Common.Interfaces;
using Contracts.Agents;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;
using TextStack.Ai.Agents;
using TextStack.Ai.Core;

namespace Api.Endpoints;

/// <summary>
/// Learning Tutor agent endpoints (AI-Agent-2). The tutor PLANS what to study next over the learner's real
/// SRS + reading state and hands off to the existing vocabulary-review flow; the plan is held server-side in a
/// <see cref="TutorSession"/> so the HITL re-plan turn survives across HTTP requests. JSON (SSE deferred).
/// Authenticated + rate-limited like the other <c>/me/*</c> agent endpoints (a turn is several LLM calls + DB
/// reads). Each planning turn is persisted as an <c>agent_run</c> (agent=<c>tutor</c>) for replay.
/// </summary>
public static class TutorEndpoints
{
    /// <summary>Default session size when the client doesn't ask for one — a sane, non-drilling session.</summary>
    public const int DefaultMaxItems = 5;

    public static void MapTutorEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/me/tutor").WithTags("Agents").RequireRateLimiting("tutor");
        group.MapPost("/session", StartSession);
        group.MapPost("/session/{id:guid}/feedback", SubmitFeedback);
    }

    // POST /me/tutor/session — plan a new session over the learner's current state.
    private static async Task<IResult> StartSession(
        TutorStartRequest? request,
        HttpContext httpContext,
        AuthService authService,
        TutorAgent agent,
        IAppDbContext db,
        IAgentRunWriter writer,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId is null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var maxItems = Math.Clamp(request?.MaxItems ?? DefaultMaxItems, 1, TutorAgent.MaxPlanItems);
        var input = new TutorInput(maxItems);

        var (plan, runId, problem) = await RunTurnAsync(
            agent, input, userId.Value, httpContext.RequestServices, writer, "tutor session start", ct);
        if (problem is not null) return problem;

        var now = DateTimeOffset.UtcNow;
        var session = new TutorSession
        {
            Id = Guid.NewGuid(),
            UserId = userId.Value,
            SiteId = siteId,
            PlanJson = plan!.ToPlanJson(),
            Status = TutorSession.StatusActive,
            TurnCount = 1,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.TutorSessions.Add(session);
        await db.SaveChangesAsync(ct);

        return Results.Ok(ToResponse(session.Id, plan, runId));
    }

    // POST /me/tutor/session/{id}/feedback — re-plan the remainder given the learner's results.
    private static async Task<IResult> SubmitFeedback(
        Guid id,
        TutorFeedbackRequest? request,
        HttpContext httpContext,
        AuthService authService,
        TutorAgent agent,
        IAppDbContext db,
        IAgentRunWriter writer,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId is null) return Results.Unauthorized();

        var session = await db.TutorSessions
            .FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId.Value, ct);
        if (session is null) return Results.NotFound();
        if (session.Status != TutorSession.StatusActive)
            return Results.BadRequest(new { error = "Session is already completed." });

        // Feedback is the learner's results for cards in the prior plan; an empty body re-plans from scratch.
        // Trust nothing the client sends verbatim: ignore any result whose wordId was NOT in the prior plan
        // (a client can't steer the re-plan with arbitrary ids it never saw).
        var priorPlanIds = PriorPlanWordIds(session.PlanJson);
        var feedback = (request?.Results ?? [])
            .Where(r => priorPlanIds.Contains(r.WordId))
            .Select(r => new TutorFeedbackItem(r.WordId, r.Correct, Math.Max(0, r.ResponseTimeMs)))
            .ToList();
        var maxItems = CountPlanItems(session.PlanJson, fallback: DefaultMaxItems);
        var input = new TutorInput(maxItems, feedback);

        var (plan, runId, problem) = await RunTurnAsync(
            agent, input, userId.Value, httpContext.RequestServices, writer, "tutor re-plan", ct);
        if (problem is not null) return problem;

        // Deterministic backstop (not LLM-trusted): drop any item the learner just answered correctly so a
        // just-passed card can never be re-surfaced this turn, regardless of what the model planned.
        plan = DropPassedCards(plan!, feedback);

        session.PlanJson = plan.ToPlanJson();
        session.TurnCount += 1;
        session.UpdatedAt = DateTimeOffset.UtcNow;
        // An empty re-plan means there's nothing left to study — the session is done.
        if (plan.Items.Count == 0)
            session.Status = TutorSession.StatusCompleted;
        await db.SaveChangesAsync(ct);

        return Results.Ok(ToResponse(session.Id, plan, runId));
    }

    /// <summary>
    /// Runs one planning turn and persists it as an <c>agent_run</c> (best-effort telemetry). Returns the plan
    /// (null on failure), the run id, and a populated problem result when the turn could not complete.
    /// </summary>
    private static async Task<(TutorPlan? Plan, Guid RunId, IResult? Problem)> RunTurnAsync(
        TutorAgent agent, TutorInput input, Guid userId, IServiceProvider services, IAgentRunWriter writer,
        string goalLabel, CancellationToken ct)
    {
        var runId = Guid.NewGuid();
        // The agent's tools resolve scoped services (IAppDbContext, IRagService) from the request scope.
        var ctx = new AgentContext(userId, null, runId, services);

        TutorRun? outcome = null;
        AgentRunRecord record;
        try
        {
            outcome = await agent.RunAsync(input, ctx, ct);
            record = AgentRunRecordFactory.Completed(
                runId, TutorAgent.AgentName, userId, editionId: null, goalLabel, outcome.Run)
                with
            { ToolCallsCount = outcome.ToolCallsCount };
        }
        catch (AgentBudgetExhaustedException ex)
        {
            record = AgentRunRecordFactory.BudgetExhausted(
                runId, TutorAgent.AgentName, userId, editionId: null, goalLabel, ex);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            record = AgentRunRecordFactory.Failed(runId, TutorAgent.AgentName, userId, editionId: null, goalLabel, ex);
        }

        try { await writer.WriteAsync(record, ct); }
        catch { /* telemetry only */ }

        if (outcome is null)
            return (null, runId, Results.Problem("The tutor could not plan this session.", statusCode: 503));

        return (outcome.Plan, runId, null);
    }

    private static TutorSessionResponse ToResponse(Guid sessionId, TutorPlan plan, Guid runId) =>
        new(
            sessionId,
            plan.Items.Select(i => new TutorPlanItemDto(
                i.WordId, i.Word, i.Stage, i.ExerciseType, i.Difficulty, i.Why)).ToList(),
            plan.Rationale,
            plan.ReadingNudge,
            runId);

    /// <summary>
    /// Deterministic backstop (not LLM-trusted): removes any plan item whose card the learner just answered
    /// <c>correct:true</c> in this feedback turn, so a just-passed card can never be re-surfaced regardless of
    /// what the model planned.
    /// </summary>
    internal static TutorPlan DropPassedCards(TutorPlan plan, IReadOnlyList<TutorFeedbackItem> feedback)
    {
        var justPassed = feedback.Where(f => f.Correct).Select(f => f.WordId).ToHashSet();
        if (justPassed.Count == 0) return plan;
        return plan with { Items = plan.Items.Where(i => !justPassed.Contains(i.WordId)).ToList() };
    }

    /// <summary>
    /// The set of wordIds in a persisted plan — feedback for any id NOT here is dropped (a client can't feed
    /// the re-plan arbitrary ids it was never shown). Reads the camelCase "items"/"wordId" Web-serialized shape.
    /// </summary>
    internal static HashSet<Guid> PriorPlanWordIds(string planJson)
    {
        var ids = new HashSet<Guid>();
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(planJson);
            if (doc.RootElement.TryGetProperty("items", out var items) && items.ValueKind == System.Text.Json.JsonValueKind.Array)
            {
                foreach (var item in items.EnumerateArray())
                {
                    if (item.ValueKind == System.Text.Json.JsonValueKind.Object
                        && item.TryGetProperty("wordId", out var w)
                        && w.ValueKind == System.Text.Json.JsonValueKind.String
                        && Guid.TryParse(w.GetString(), out var id))
                        ids.Add(id);
                }
            }
        }
        catch { /* malformed persisted plan → no trusted prior ids */ }
        return ids;
    }

    /// <summary>Counts the items in a persisted plan (the prior session size) to keep re-plan turns the same length.</summary>
    internal static int CountPlanItems(string planJson, int fallback)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(planJson);
            // ToPlanJson serializes with Web defaults (camelCase) → the property is "items", and
            // TryGetProperty is case-sensitive. Matching "Items" here silently never hit → re-plan always fell
            // back to the default length regardless of the session's original maxItems.
            if (doc.RootElement.TryGetProperty("items", out var items) && items.ValueKind == System.Text.Json.JsonValueKind.Array)
                return Math.Clamp(items.GetArrayLength(), 1, TutorAgent.MaxPlanItems);
        }
        catch { /* fall through */ }
        return fallback;
    }
}
