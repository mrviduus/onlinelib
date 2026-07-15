using Api.Extensions;
using Application.Ai;
using Application.Auth;
using Application.Rag;
using Contracts.Books;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Rag;

namespace Api.Endpoints;

/// <summary>
/// "Ask this book" over a USER-uploaded book (Phase 2; conversational upgrade AI-028). Owner-scoped:
/// the authenticated user asks a question over their OWN uploaded document → per-user isolated retrieval
/// (<see cref="UserBookRagContextService"/>) → grounded, conversational answer with citations
/// (<see cref="RagAskService"/>, shared with the catalog path). No spoiler gate — it's the user's own
/// book — so the full book is in scope. Content-negotiated SSE/JSON like the catalog endpoint;
/// multi-turn history on the request. <c>CurrentChapterId</c> is accepted but ignored (no gate). 404
/// when the book isn't this user's.
/// </summary>
public static class UserBookAskEndpoints
{
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
        ILogger<Program> logger,
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

        // Overview-class questions need broad section coverage → wider default k; explicit request.K wins.
        var defaultK = RagAskPrompt.IsOverviewQuestion(request.Question) ? IRagService.OverviewK : IRagService.DefaultK;
        var k = request.K is > 0 ? request.K.Value : defaultK;
        var history = RagAskHistory.Clamp(request.History);

        try
        {
            // Ownership-scoped context build. Null => not this user's book (or taken down) → 404.
            var ctx = await context.BuildAsync(userId.Value, id, request.Question, k, ct);
            if (ctx is null) return Results.NotFound("Book not found");

            // Full-book retrieval (no gate), no private-notes corpus. lastReadOrd is 0 (unused for
            // user books). The service handles the empty-chunks case (book not indexed yet) without an
            // LLM call (JSON: "insufficient" answer; SSE: friendly delta + insufficient terminal).
            if (AskSse.WantsSse(httpContext))
            {
                return AskSse.Stream(
                    httpContext,
                    ct2 => ask.StreamAsync(request.Question, ctx.Chunks, [], history, lastReadOrd: 0, ct2),
                    logger);
            }

            var answer = await ask.AskFromChunksAsync(request.Question, ctx.Chunks, [], history, lastReadOrd: 0, ct);
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
