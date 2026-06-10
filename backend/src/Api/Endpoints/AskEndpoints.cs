using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.Common.Interfaces;
using Application.Rag;
using Contracts.Books;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Rag;

namespace Api.Endpoints;

/// <summary>
/// Public "Ask this book" (Phase 4 RAG, AI-025). Authenticated question over a catalog edition →
/// spoiler-safe retrieval (<see cref="RagContextService"/>) → grounded answer with citations. JSON
/// for now; SSE/token streaming lands in AI-028. The reader UI + citation deep-links are AI-026.
/// </summary>
public static class AskEndpoints
{
    private const int PreviewChars = 200;

    public static void MapAskEndpoints(this WebApplication app)
    {
        app.MapPost("/books/{editionId:guid}/ask", Ask)
            .WithTags("RAG")
            .RequireRateLimiting("rag.ask");
    }

    private static async Task<IResult> Ask(
        Guid editionId,
        AskRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        IServiceProvider services,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        if (string.IsNullOrWhiteSpace(request.Question))
            return Results.BadRequest(new { error = "Question is required." });

        var siteId = httpContext.GetSiteId();

        var editionExists = await db.Editions.AnyAsync(e => e.Id == editionId && e.SiteId == siteId, ct);
        if (!editionExists) return Results.NotFound("Edition not found");

        // RagAskService construction pulls in the embedder, which throws without an OpenAI key —
        // surface that as a clean 503 rather than a generic 500.
        RagAskService ask;
        try
        {
            ask = services.GetRequiredService<RagAskService>();
        }
        catch (InvalidOperationException)
        {
            return Results.Problem("Ask is not configured (no OpenAI key).", statusCode: 503);
        }

        try
        {
            var k = request.K is > 0 ? request.K.Value : IRagService.DefaultK;
            var answer = await ask.AskAsync(userId.Value, siteId, editionId, request.Question, k, ct);

            var citations = answer.Citations.Select(c => new AskCitation(
                c.Marker, c.Chunk.ChunkId, c.Chunk.ChapterId, c.Chunk.ChapterOrd,
                c.Chunk.CharStart, c.Chunk.CharEnd, Preview(c.Chunk.Text))).ToList();

            return Results.Ok(new AskResponse(answer.Answer, citations, answer.LastReadOrd, answer.Insufficient));
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

    private static string Preview(string text) =>
        text.Length <= PreviewChars ? text : text[..PreviewChars] + "…";
}
