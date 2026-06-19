using Api.Extensions;
using Application.Auth;
using Application.Rag;
using Contracts.Books;
using Domain.Enums;
using Infrastructure.Persistence;
using Infrastructure.Rag;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

/// <summary>
/// On-demand per-book RAG indexing for USER-uploaded books (Phase 2 "Ask this book"). Mirrors the
/// catalog <see cref="BookIndexEndpoints"/> but owner-scoped to the authenticated user:
/// <list type="bullet">
///   <item><c>POST /me/books/{id}/index</c> — atomically claim (NotIndexed/Failed → Indexing) the
///   user's own book, clear stale chunks, chunk it, return 202; idempotent no-op (200) if already
///   Indexing/Ready. 404 if the book isn't this user's.</item>
///   <item><c>GET  /me/books/{id}/index</c> — current { status, chunkCount, embeddedCount } for polling.</item>
/// </list>
/// The shared embedding worker fills the vectors and flips Indexing → Ready.
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
        BookChunkingService chunking,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        // Validate the book exists AND belongs to this user (404 otherwise — never leak existence of
        // another user's book). Read the prior status to drive the (pure, tested) claim decision.
        var prior = await db.UserBooks
            .Where(b => b.Id == id && b.UserId == userId.Value && b.TakedownAt == null)
            .Select(b => (RagIndexStatus?)b.RagStatus)
            .FirstOrDefaultAsync(ct);
        if (prior is null) return Results.NotFound("Book not found");

        // Atomic claim / dedup (mirrors RagIndexLogic.CanClaim + the catalog SQL). The user_id guard is
        // redundant with the lookup above but keeps the claim itself owner-scoped.
        var claimed = await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE user_books
            SET rag_status = 1, rag_error = NULL
            WHERE id = {id} AND user_id = {userId.Value} AND rag_status IN (0, 3);
            """, ct);

        if (claimed == 0)
        {
            var current = await ReadStatusAsync(db, id, ct);
            return current is null ? Results.NotFound("Book not found") : Results.Ok(current);
        }

        // Clear any pre-existing chunks before re-chunking (Failed re-claims or a prior partial run),
        // so chunking never doubles up rows. Harmless no-op on a fresh book.
        if (RagIndexLogic.ShouldClearChunksBeforeChunking(prior.Value))
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                // Scope to the owner too (defense in depth) — every user_chapter_chunk
                // statement filters both, even though id is owner-validated above.
                $"DELETE FROM user_chapter_chunk WHERE user_book_id = {id} AND user_id = {userId.Value};", ct);
        }

        var chunkCount = await chunking.ChunkUserBookAsync(db, id, ct);

        var book = await db.UserBooks.FirstAsync(b => b.Id == id, ct);
        if (chunkCount == 0)
        {
            book.RagStatus = RagIndexStatus.Failed;
            book.RagChunkCount = 0;
            book.RagEmbeddedCount = 0;
            book.RagError = "No chapters to index";
            book.RagIndexedAt = null;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new BookIndexStatusDto("Failed", 0, 0));
        }

        book.RagStatus = RagIndexStatus.Indexing;
        book.RagChunkCount = chunkCount;
        book.RagEmbeddedCount = 0;
        book.RagError = null;
        book.RagIndexedAt = null;
        await db.SaveChangesAsync(ct);

        return Results.Json(new BookIndexStatusDto("Indexing", chunkCount, 0), statusCode: StatusCodes.Status202Accepted);
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
