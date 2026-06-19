using Api.Extensions;
using Application.Auth;
using Application.Rag;
using Contracts.Books;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Rag;

namespace Api.Endpoints;

/// <summary>
/// "Ask this book" over a USER-uploaded book (Phase 2). Owner-scoped: the authenticated user asks a
/// question over their OWN uploaded document → per-user isolated retrieval
/// (<see cref="UserBookRagContextService"/>) → grounded answer with citations
/// (<see cref="RagAskService.AskFromChunksAsync"/>, shared with the catalog path). No spoiler gate —
/// it's the user's own book — so the full book is in scope. Returns the same
/// <see cref="AskResponse"/> contract as the catalog endpoint. <c>CurrentChapterId</c> on the request
/// is accepted but ignored (no gate). 404 when the book isn't this user's.
/// </summary>
public static class UserBookAskEndpoints
{
    private const int PreviewChars = 200;

    public static void MapUserBookAskEndpoints(this WebApplication app)
    {
        app.MapPost("/me/books/{id:guid}/ask", Ask)
            .WithTags("User Books RAG")
            .RequireRateLimiting("rag.ask");
    }

    private static async Task<IResult> Ask(
        Guid id,
        AskRequest request,
        HttpContext httpContext,
        AuthService authService,
        IServiceProvider services,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        if (string.IsNullOrWhiteSpace(request.Question))
            return Results.BadRequest(new { error = "Question is required." });

        // Both services pull in the embedder, which throws without an OpenAI key — surface a clean 503.
        UserBookRagContextService context;
        RagAskService ask;
        try
        {
            context = services.GetRequiredService<UserBookRagContextService>();
            ask = services.GetRequiredService<RagAskService>();
        }
        catch (InvalidOperationException)
        {
            return Results.Problem("Ask is not configured (no OpenAI key).", statusCode: 503);
        }

        try
        {
            var k = request.K is > 0 ? request.K.Value : IRagService.DefaultK;

            // Ownership-scoped context build. Null => not this user's book (or taken down) → 404.
            var ctx = await context.BuildAsync(userId.Value, id, request.Question, k, ct);
            if (ctx is null) return Results.NotFound("Book not found");

            // Full-book retrieval (no gate), no private-notes corpus. lastReadOrd is 0 (unused for
            // user books). AskFromChunksAsync handles the empty-chunks case (book not indexed yet) by
            // returning an "insufficient" answer without an LLM call.
            var answer = await ask.AskFromChunksAsync(request.Question, ctx.Chunks, [], lastReadOrd: 0, ct);

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
