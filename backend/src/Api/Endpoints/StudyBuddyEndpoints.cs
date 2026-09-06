using System.Net.ServerSentEvents;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Api.Extensions;
using Api.Sites;
using Application.Agents;
using Application.Auth;
using Application.Common.Interfaces;
using Contracts.Agents;
using Microsoft.EntityFrameworkCore;
using TextStack.Ai.Agents;
using TextStack.Ai.Core;

namespace Api.Endpoints;

/// <summary>
/// Study Buddy agent endpoints (Phase 6, AI-037b). <c>POST /me/books/{editionId}/studybuddy</c> runs
/// the agent on a highlighted passage and streams its steps over SSE (<c>step</c>* → <c>done</c> |
/// <c>error</c>), persisting the run (AI-036) when it finishes. <c>GET /me/studybuddy/runs/{id}</c>
/// returns a persisted run for the "show steps" UI. Authenticated; rate-limited (agent runs are
/// several LLM calls each).
/// </summary>
public static class StudyBuddyEndpoints
{
    private const string Agent = "studybuddy";
    private const int MaxPassageLength = 4000;

    public static void MapStudyBuddyEndpoints(this WebApplication app)
    {
        app.MapPost("/me/books/{editionId:guid}/studybuddy", Run)
            .WithTags("Agents")
            .RequireRateLimiting("studybuddy")
            // Paid inference — real account only (Entitlements:Tiers:*:AiEnabled). Only the POST:
            // the GET below just reads a run this user could never have created anyway.
            .RequireAiAccount();

        app.MapGet("/me/studybuddy/runs/{runId:guid}", GetRun)
            .WithTags("Agents");
    }

    private static async Task<IResult> Run(
        Guid editionId,
        StudyBuddyRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        StudyBuddyAgent agent,
        IAgentRunWriter writer,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId is null) return Results.Unauthorized();

        if (string.IsNullOrWhiteSpace(request.Passage))
            return Results.BadRequest(new { error = "Passage is required." });
        if (request.Passage.Length > MaxPassageLength)
            return Results.BadRequest(new { error = $"Passage exceeds {MaxPassageLength} chars." });

        var editionExists = await db.Editions.AnyAsync(e => e.Id == editionId, ct);
        if (!editionExists) return Results.NotFound("Edition not found");

        // Cloudflare/nginx must not buffer the stream (same Phase 5 risk as Explain SSE).
        httpContext.Response.Headers["X-Accel-Buffering"] = "no";
        httpContext.Response.Headers.CacheControl = "no-cache";

        var runId = Guid.NewGuid();
        var input = new StudyBuddyInput(request.Passage, editionId, request.ChapterNumber);

        return TypedResults.ServerSentEvents(StreamRunAsync(
            agent, writer, runId, userId.Value, editionId, input, httpContext.RequestServices,
            httpContext.RequestAborted));
    }

    /// <summary>
    /// Streams the agent's steps as SSE and persists the run on completion. <c>step</c> per recorded
    /// step, <c>done</c> with the final answer, or <c>error</c> when the agent fails / exhausts its
    /// budget — the run is persisted with the right status either way (a budget-exhausted run keeps
    /// its partial transcript, AI-036). Client disconnect propagates untraced.
    /// </summary>
    public static async IAsyncEnumerable<SseItem<string>> StreamRunAsync(
        StudyBuddyAgent agent,
        IAgentRunWriter writer,
        Guid runId,
        Guid userId,
        Guid editionId,
        StudyBuddyInput input,
        IServiceProvider requestServices,
        [EnumeratorCancellation] CancellationToken ct)
    {
        var ctx = new AgentContext(userId, editionId, runId, requestServices);

        AgentResult<string>? result = null;
        AgentBudgetExhaustedException? budgetExhausted = null;
        Exception? failure = null;

        await using var e = agent.StreamAsync(input, ctx, ct).GetAsyncEnumerator(ct);
        while (true)
        {
            AgentEvent ev;
            try
            {
                if (!await e.MoveNextAsync())
                    break;
                ev = e.Current;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw; // client disconnected — nothing to emit or persist
            }
            catch (AgentBudgetExhaustedException ex)
            {
                budgetExhausted = ex;
                break;
            }
            catch (Exception ex)
            {
                failure = ex;
                break;
            }

            if (ev.Step is { } step)
                yield return new SseItem<string>(SerializeStep(step), "step");
            else if (ev.Result is { } r)
            {
                result = r;
                yield return new SseItem<string>(SerializeDone(runId, r), "done");
            }
        }

        var record = result is not null
            ? AgentRunRecordFactory.Completed(runId, Agent, userId, editionId, input.Passage, result)
            : budgetExhausted is not null
                ? AgentRunRecordFactory.BudgetExhausted(runId, Agent, userId, editionId, input.Passage, budgetExhausted)
                : AgentRunRecordFactory.Failed(runId, Agent, userId, editionId, input.Passage,
                    failure ?? new InvalidOperationException("Agent stream ended without a result."));

        // Best-effort persistence — a failed write must not break the response the client already got.
        var persisted = true;
        try
        {
            await writer.WriteAsync(record, ct);
        }
        catch
        {
            persisted = false;
        }

        if (result is null)
            yield return new SseItem<string>(SerializeError(runId, record.Error, persisted), "error");
    }

    private static async Task<IResult> GetRun(
        Guid runId, HttpContext httpContext, AuthService authService, IAppDbContext db, CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId is null) return Results.Unauthorized();

        var run = await db.AgentRuns
            .Where(r => r.Id == runId && r.UserId == userId)
            .FirstOrDefaultAsync(ct);
        if (run is null) return Results.NotFound();

        using var steps = JsonDocument.Parse(run.StepsJson);
        return Results.Ok(new StudyBuddyRunDto(
            run.Id, run.Agent, run.Status, run.Output, steps.RootElement.Clone(),
            run.Iterations, run.CostUsd, run.LatencyMs, run.Error, run.CreatedAt));
    }

    private static string SerializeStep(AgentStep step) =>
        JsonSerializer.Serialize(new { index = step.Index, kind = step.Kind, payload = step.Payload, at = step.At });

    private static string SerializeDone(Guid runId, AgentResult<string> result) =>
        JsonSerializer.Serialize(new
        {
            runId,
            answer = result.Output,
            iterations = result.Usage.Iterations,
            costUsd = result.Usage.CostUsdTotal,
        });

    private static string SerializeError(Guid runId, string? message, bool persisted) =>
        JsonSerializer.Serialize(new { runId, error = message ?? "Agent run failed", persisted });
}
