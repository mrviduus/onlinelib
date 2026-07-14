using Api.Extensions;
using Application.Auth;
using Contracts.Books;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

/// <summary>
/// On-demand per-book RAG indexing (Phase 1 "Ask this book"). Catalog editions imported before RAG
/// have zero <c>chapter_chunk</c> rows, so Ask returns "not enough read" for everyone. These endpoints
/// let an authenticated user trigger indexing for a book and poll its state:
/// <list type="bullet">
///   <item><c>POST /books/{editionId}/index</c> — atomically claim (NotIndexed/Failed → Indexing) and
///   return 202 immediately; idempotent no-op (200) if already Indexing/Ready. The chunking runs OFF
///   this request in the Worker (<c>RagIndexingWorker</c>).</item>
///   <item><c>GET  /books/{editionId}/index</c> — current { status, chunkCount, embeddedCount } for polling.</item>
/// </list>
/// The Worker chunks the claimed edition and the embedding worker fills the vectors and flips
/// Indexing → Ready. User books are Phase 2.
/// </summary>
public static class BookIndexEndpoints
{
    public static void MapBookIndexEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/books").WithTags("RAG");

        group.MapPost("/{editionId:guid}/index", TriggerIndex)
            .RequireRateLimiting("rag.index");

        group.MapGet("/{editionId:guid}/index", GetIndexStatus);
    }

    private static async Task<IResult> TriggerIndex(
        Guid editionId,
        HttpContext httpContext,
        AuthService authService,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        // Validate the edition exists + belongs to this site (mirror AskEndpoints).
        var exists = await db.Editions.AnyAsync(e => e.Id == editionId, ct);
        if (!exists) return Results.NotFound("Edition not found");

        // Atomic claim / dedup (guard mirrors RagIndexLogic.CanClaim): only NotIndexed(0) or Failed(3)
        // editions transition to Indexing(1). We reset chunk/embedded counts AND clear the
        // indexing-started stamp so the row becomes a clean QUEUED row (RagIndexLogic.IsQueuedForIndexing)
        // that the Worker sweep picks up. The chunk-clear + chunking themselves now run OFF this request
        // in the Worker (RagIndexingWorker) — see UserBookIndexEndpoints for the timeout rationale.
        var claimed = await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE editions
            SET rag_status = 1, rag_error = NULL, rag_chunk_count = 0, rag_embedded_count = 0,
                rag_indexed_at = NULL, rag_indexing_started_at = NULL
            WHERE id = {editionId} AND rag_status IN (0, 3);
            """, ct);

        if (claimed == 0)
        {
            // Already Indexing or Ready — return current state, no-op (200).
            var current = await ReadStatusAsync(db, editionId, ct);
            return current is null ? Results.NotFound("Edition not found") : Results.Ok(current);
        }

        // Queued — the Worker chunks it (clearing any legacy/partial chunks first) and the embedding
        // worker fills the vectors and flips Indexing → Ready.
        return Results.Json(new BookIndexStatusDto("Indexing", 0, 0), statusCode: StatusCodes.Status202Accepted);
    }

    private static async Task<IResult> GetIndexStatus(
        Guid editionId,
        HttpContext httpContext,
        AuthService authService,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var exists = await db.Editions.AnyAsync(e => e.Id == editionId, ct);
        if (!exists) return Results.NotFound("Edition not found");

        var status = await ReadStatusAsync(db, editionId, ct);
        return status is null ? Results.NotFound("Edition not found") : Results.Ok(status);
    }

    private static async Task<BookIndexStatusDto?> ReadStatusAsync(
        AppDbContext db, Guid editionId, CancellationToken ct)
    {
        var row = await db.Editions
            .Where(e => e.Id == editionId)
            .Select(e => new { e.RagStatus, e.RagChunkCount, e.RagEmbeddedCount })
            .FirstOrDefaultAsync(ct);

        return row is null
            ? null
            : new BookIndexStatusDto(row.RagStatus.ToString(), row.RagChunkCount, row.RagEmbeddedCount);
    }
}
