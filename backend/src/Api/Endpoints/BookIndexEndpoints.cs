using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.Rag;
using Contracts.Books;
using Domain.Enums;
using Infrastructure.Persistence;
using Infrastructure.Rag;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

/// <summary>
/// On-demand per-book RAG indexing (Phase 1 "Ask this book"). Catalog editions imported before RAG
/// have zero <c>chapter_chunk</c> rows, so Ask returns "not enough read" for everyone. These endpoints
/// let an authenticated user trigger indexing for a book and poll its state:
/// <list type="bullet">
///   <item><c>POST /books/{editionId}/index</c> — atomically claim (NotIndexed/Failed → Indexing),
///   chunk the edition, return 202; idempotent no-op (200) if already Indexing/Ready.</item>
///   <item><c>GET  /books/{editionId}/index</c> — current { status, chunkCount, embeddedCount } for polling.</item>
/// </list>
/// The embedding worker fills the vectors and flips Indexing → Ready. User books are Phase 2.
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
        BookChunkingService chunking,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var siteId = httpContext.GetSiteId();

        // Validate the edition exists + belongs to this site (mirror AskEndpoints). Read the prior
        // status to drive the (pure, tested) claim decision; the actual transition is still atomic.
        var prior = await db.Editions
            .Where(e => e.Id == editionId && e.SiteId == siteId)
            .Select(e => (RagIndexStatus?)e.RagStatus)
            .FirstOrDefaultAsync(ct);
        if (prior is null) return Results.NotFound("Edition not found");

        // Atomic claim / dedup (guard mirrors RagIndexLogic.CanClaim): only NotIndexed(0) or
        // Failed(3) editions transition to Indexing(1). A concurrent/repeat trigger affects 0 rows.
        var claimed = await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE editions
            SET rag_status = 1, rag_error = NULL
            WHERE id = {editionId} AND rag_status IN (0, 3);
            """, ct);

        if (claimed == 0)
        {
            // Already Indexing or Ready — return current state, no-op (200).
            var current = await ReadStatusAsync(db, editionId, ct);
            return current is null ? Results.NotFound("Edition not found") : Results.Ok(current);
        }

        // Clear any pre-existing chunks before re-chunking. This covers:
        //   * Failed re-claims (stale partial chunks), and
        //   * NotIndexed claims of legacy editions that ALREADY have chapter_chunk rows from the
        //     pre-Phase-1 ingestion chunker (AI-019) but were defaulted to NotIndexed/count=0 by the
        //     AddEditionRagIndexState migration. Without this, ChunkEditionAsync would AddRange a
        //     second full set → duplicate chunks, double OpenAI embed spend, and a chunk_count that
        //     never equals embedded_count (Ready never flips → stuck "Indexing" forever).
        // On a truly-empty NotIndexed claim the DELETE is a harmless no-op.
        if (RagIndexLogic.ShouldClearChunksBeforeChunking(prior.Value))
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"DELETE FROM chapter_chunk WHERE edition_id = {editionId};", ct);
        }

        var chunkCount = await chunking.ChunkEditionAsync(db, editionId, ct);

        var edition = await db.Editions.FirstAsync(e => e.Id == editionId, ct);
        if (chunkCount == 0)
        {
            edition.RagStatus = RagIndexStatus.Failed;
            edition.RagChunkCount = 0;
            edition.RagEmbeddedCount = 0;
            edition.RagError = "No chapters to index";
            edition.RagIndexedAt = null;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new BookIndexStatusDto("Failed", 0, 0));
        }

        edition.RagStatus = RagIndexStatus.Indexing;
        edition.RagChunkCount = chunkCount;
        edition.RagEmbeddedCount = 0;
        edition.RagError = null;
        edition.RagIndexedAt = null;
        await db.SaveChangesAsync(ct);

        return Results.Json(new BookIndexStatusDto("Indexing", chunkCount, 0), statusCode: StatusCodes.Status202Accepted);
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

        var siteId = httpContext.GetSiteId();
        var exists = await db.Editions.AnyAsync(e => e.Id == editionId && e.SiteId == siteId, ct);
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
