using Api.Extensions;
using Application.Agents;
using Application.Auth;
using Contracts.Agents;
using TextStack.Ai.Agents;
using TextStack.Ai.Core;

namespace Api.Endpoints;

/// <summary>
/// Librarian agent endpoint (AI-Agent-3). <c>POST /me/librarian</c> runs the agent on a natural-language catalog
/// request and returns ranked, reasoned recommendations as JSON (SSE deferred), persisting the run (agent=
/// <c>librarian</c>) for replay in the admin AI-quality UI. Authenticated; rate-limited like Study Buddy (an
/// agent run is several LLM calls + maybe external HTTP). Recommend-only: external (Open Library) hits are
/// suggestions, never ingested this slice.
/// </summary>
public static class LibrarianEndpoints
{
    public const int MaxQueryLength = 500;
    // Mirror the RAG / hybrid-search ≥2-char guard: a 1-char query has no usable intent — reject it before
    // spending a full multi-call agent run.
    public const int MinQueryLength = 2;

    /// <summary>
    /// Pure request-validation (unit-tested): returns the rejection reason, or null when the query is acceptable
    /// to run the agent on. Rejects blank, &lt; <see cref="MinQueryLength"/> trimmed chars (a 1-char query has no
    /// usable intent — don't burn a multi-call agent run on it), and &gt; <see cref="MaxQueryLength"/> chars.
    /// </summary>
    public static string? ValidateQuery(string? query)
    {
        if (string.IsNullOrWhiteSpace(query))
            return "Query is required.";
        if (query.Trim().Length < MinQueryLength)
            return $"Query must be at least {MinQueryLength} characters.";
        if (query.Length > MaxQueryLength)
            return $"Query exceeds {MaxQueryLength} chars.";
        return null;
    }

    public static void MapLibrarianEndpoints(this WebApplication app)
    {
        app.MapPost("/me/librarian", Run)
            .WithTags("Agents")
            .RequireRateLimiting("librarian");
    }

    private static async Task<IResult> Run(
        LibrarianRequest request,
        HttpContext httpContext,
        AuthService authService,
        LibrarianAgent agent,
        IAgentRunWriter writer,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId is null) return Results.Unauthorized();

        if (ValidateQuery(request.Query) is { } error)
            return Results.BadRequest(new { error });

        var runId = Guid.NewGuid();
        var input = new LibrarianInput(request.Query);
        // The agent's tools resolve scoped services (IAppDbContext, LibrarySearchService, IHttpClientFactory)
        // from the request scope.
        var ctx = new AgentContext(userId.Value, null, runId, httpContext.RequestServices);

        LibrarianRun? outcome = null;
        AgentRunRecord record;
        try
        {
            outcome = await agent.RunAsync(input, ctx, ct);
            record = AgentRunRecordFactory.Completed(
                runId, LibrarianAgent.AgentName, userId, editionId: null, input.Query, outcome.Run)
                with
            { ToolCallsCount = outcome.ToolCallsCount };
        }
        catch (AgentBudgetExhaustedException ex)
        {
            // Budget-exhausted runs keep their partial transcript (AI-036) but produced no final answer.
            record = AgentRunRecordFactory.BudgetExhausted(
                runId, LibrarianAgent.AgentName, userId, editionId: null, input.Query, ex);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw; // client disconnected — nothing to persist
        }
        catch (Exception ex)
        {
            record = AgentRunRecordFactory.Failed(
                runId, LibrarianAgent.AgentName, userId, editionId: null, input.Query, ex);
        }

        // Best-effort persistence — a failed write must not fail the response the client gets.
        try { await writer.WriteAsync(record, ct); }
        catch { /* telemetry only */ }

        if (outcome is null)
            return Results.Problem("The librarian could not complete the request.", statusCode: 503);

        var answer = outcome.Answer;
        return Results.Ok(new LibrarianResponse(
            answer.Recommendations.Select(r => new LibrarianRecommendationDto(
                r.Source, r.EditionId, r.Slug, r.Title, r.Authors, r.Why, r.Language, r.Year, r.Pages)).ToList(),
            answer.Reasoning,
            answer.UsedExternal,
            runId));
    }
}
