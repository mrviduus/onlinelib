using Api.Extensions;
using Application.Auth;
using Contracts.Books;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

/// <summary>
/// On-demand per-book RAG indexing for USER-uploaded books (Phase 2 "Ask this book"). Mirrors the
/// catalog <see cref="BookIndexEndpoints"/> but owner-scoped to the authenticated user:
/// <list type="bullet">
///   <item><c>POST /me/books/{id}/index</c> — atomically claim (NotIndexed/Failed → Indexing) the
///   user's own book and return 202 immediately; idempotent no-op (200) if already Indexing/Ready.
///   404 if the book isn't this user's. The chunking runs OFF this request in the Worker
///   (<c>RagIndexingWorker</c>) — a user PDF's vision parse is minutes long and would die on the
///   Cloudflare/API-restart timeout, stranding the row Indexing forever.</item>
///   <item><c>GET  /me/books/{id}/index</c> — current { status, chunkCount, embeddedCount } for polling.</item>
/// </list>
/// The Worker chunks the claimed book (terminal Failed on empty/error) and the embedding worker fills
/// the vectors and flips Indexing → Ready.
/// </summary>
public static class UserBookIndexEndpoints
{
    public static void MapUserBookIndexEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/me/books").WithTags("User Books RAG");

        group.MapPost("/{id:guid}/index", TriggerIndex)
            .RequireRateLimiting("rag.index");

        group.MapGet("/{id:guid}/index", GetIndexStatus);
    }

    private static async Task<IResult> TriggerIndex(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        // Validate the book exists AND belongs to this user (404 otherwise — never leak existence of
        // another user's book).
        var exists = await db.UserBooks
            .AnyAsync(b => b.Id == id && b.UserId == userId.Value && b.TakedownAt == null, ct);
        if (!exists) return Results.NotFound("Book not found");

        // Atomic claim / dedup (guard mirrors RagIndexLogic.CanClaim): only NotIndexed(0) or Failed(3)
        // books transition to Indexing(1). We reset chunk/embedded counts AND clear the indexing-started
        // stamp so the row becomes a clean QUEUED row (RagIndexLogic.IsQueuedForIndexing) that the Worker
        // sweep picks up. The chunking itself no longer runs in this request — a user PDF's vision parse
        // is minutes long and would die on the Cloudflare/API-restart timeout, stranding the row Indexing.
        var claimed = await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE user_books
            SET rag_status = 1, rag_error = NULL, rag_chunk_count = 0, rag_embedded_count = 0,
                rag_indexed_at = NULL, rag_indexing_started_at = NULL
            WHERE id = {id} AND user_id = {userId.Value} AND rag_status IN (0, 3);
            """, ct);

        if (claimed == 0)
        {
            // Already Indexing or Ready — return current state, no-op (200).
            var current = await ReadStatusAsync(db, id, ct);
            return current is null ? Results.NotFound("Book not found") : Results.Ok(current);
        }

        // Queued — the Worker's RagIndexingWorker will chunk it and the embedding worker will flip it Ready.
        return Results.Json(new BookIndexStatusDto("Indexing", 0, 0), statusCode: StatusCodes.Status202Accepted);
    }

    private static async Task<IResult> GetIndexStatus(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var exists = await db.UserBooks
            .AnyAsync(b => b.Id == id && b.UserId == userId.Value && b.TakedownAt == null, ct);
        if (!exists) return Results.NotFound("Book not found");

        var status = await ReadStatusAsync(db, id, ct);
        return status is null ? Results.NotFound("Book not found") : Results.Ok(status);
    }

    private static async Task<BookIndexStatusDto?> ReadStatusAsync(
        AppDbContext db, Guid id, CancellationToken ct)
    {
        var row = await db.UserBooks
            .Where(b => b.Id == id)
            .Select(b => new { b.RagStatus, b.RagChunkCount, b.RagEmbeddedCount })
            .FirstOrDefaultAsync(ct);

        return row is null
            ? null
            : new BookIndexStatusDto(row.RagStatus.ToString(), row.RagChunkCount, row.RagEmbeddedCount);
    }
}
