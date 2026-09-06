using Api.Extensions;
using Api.Sites;
using Application.Ai;
using Application.Auth;
using Application.Common.Interfaces;
using Application.Rag;
using Contracts.Books;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Rag;

namespace Api.Endpoints;

/// <summary>
/// Public "Ask this book" (Phase 4 RAG, AI-025; conversational upgrade AI-028). Authenticated question
/// over a catalog edition → spoiler-safe retrieval (<see cref="RagContextService"/>) → grounded,
/// conversational answer with citations. Content-negotiated: <c>Accept: text/event-stream</c> streams
/// tokens (SSE — <c>delta</c>* then <c>done</c>); anything else returns the original JSON
/// <see cref="AskResponse"/> (eval + mobile keep working). Multi-turn history is carried on the request.
/// </summary>
public static class AskEndpoints
{
    public static void MapAskEndpoints(this WebApplication app)
    {
        app.MapPost("/books/{editionId:guid}/ask", Ask)
            .WithTags("RAG")
            .RequireRateLimiting("rag.ask")
            // Paid inference — real account only (Entitlements:Tiers:*:AiEnabled).
            .RequireAiAccount();
    }

    private static async Task<IResult> Ask(
        Guid editionId,
        AskRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        IServiceProvider services,
        ILogger<Program> logger,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        if (string.IsNullOrWhiteSpace(request.Question))
            return Results.BadRequest(new { error = "Question is required." });

        var siteId = httpContext.GetSiteId();

        var editionExists = await db.Editions.AnyAsync(e => e.Id == editionId, ct);
        if (!editionExists) return Results.NotFound("Edition not found");

        // RagAskService construction pulls in the embedder, which throws without an OpenAI key —
        // surface that as a clean 503 rather than a generic 500.
        RagContextService context;
        RagAskService ask;
        try
        {
            context = services.GetRequiredService<RagContextService>();
            ask = services.GetRequiredService<RagAskService>();
        }
        catch (InvalidOperationException)
        {
            return Results.Problem("Ask is not configured (no OpenAI key).", statusCode: 503);
        }

        // Overview-class questions ("summarize chapter 5", "main idea") need broad section coverage,
        // so default to a wider k AND guarantee the precomputed chapter summaries into retrieval.
        var summaries = RagAskPrompt.ResolveSummarySpec(request.Question);
        var defaultK = summaries.Include ? IRagService.OverviewK : IRagService.DefaultK;
        var k = request.K is > 0 ? request.K.Value : defaultK;
        var history = RagAskHistory.Clamp(request.History);

        if (AskSse.WantsSse(httpContext))
        {
            // Build the spoiler-safe context first (the gate/retrieval), then stream the answer.
            var ctx = await context.BuildAsync(userId.Value, siteId, editionId, request.Question, k, request.CurrentChapterId, summaries, ct);
            var noteTexts = ctx.Notes.Select(n => n.Text).ToList();
            return AskSse.Stream(
                httpContext,
                ct2 => ask.StreamAsync(request.Question, ctx.Chunks, noteTexts, history, ctx.LastReadOrd, ct2),
                logger);
        }

        try
        {
            var answer = await ask.AskAsync(
                userId.Value, siteId, editionId, request.Question, k, request.CurrentChapterId, history, ct);
            return Results.Ok(AskSse.ToResponse(answer));
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            return Results.StatusCode(StatusCodes.Status504GatewayTimeout);
        }
        catch (Exception)
        {
            return Results.Problem("Ask is temporarily unavailable.", statusCode: 503);
        }
    }
}
