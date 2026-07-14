using Domain.Enums;
using Infrastructure.Persistence;
using Infrastructure.Rag;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Worker.Services;

/// <summary>
/// The single seam that runs a book's on-demand "Ask this book" RAG indexing OFF the HTTP path (the
/// endpoint only claims NotIndexed/Failed → Indexing and returns 202). For a user PDF the chunking
/// is a minutes-long paid vision parse — far past the Cloudflare/API-restart timeout — so running it
/// in-request left rows stuck Indexing forever. This executor (analog of
/// <see cref="UserBookEnrichmentService"/>) makes every attempt reach a terminal outcome:
/// <list type="bullet">
///   <item>An <b>atomic per-row claim</b> stamps <c>rag_indexing_started_at = now()</c> only while the
///   row is queued (<c>rag_status = 1 AND rag_chunk_count = 0 AND rag_indexing_started_at IS NULL</c>),
///   so a double pick from the sweep is safe (loser sees rowcount 0 → returns).</item>
///   <item>Existing chunks are DELETEd first (a requeue/Failed re-claim never doubles rows).</item>
///   <item>chunk_count &gt; 0 ⇒ leave status Indexing (the embedding worker flips it Ready);
///   chunk_count == 0 OR any exception/cancellation ⇒ terminal <see cref="RagIndexStatus.Failed"/>
///   with an <c>rag_error</c>. Terminal-on-failure is the core fix.</item>
/// </list>
/// Both corpora (user_books + editions) route through here via <see cref="RagIndexingWorker"/>.
/// </summary>
public class RagIndexingService(
    IDbContextFactory<AppDbContext> dbFactory,
    BookChunkingService chunking,
    ILogger<RagIndexingService> logger)
{
    /// <summary>Index one USER book by id. No-op if it is not currently claimable (queued).</summary>
    public async Task IndexUserBookAsync(Guid bookId, CancellationToken ct)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);

        // Atomic claim: only the caller that stamps started_at on a queued row proceeds. Mirrors
        // RagIndexLogic.IsQueuedForIndexing. rowcount 0 ⇒ already owned / not queued → return.
        var claimed = await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE user_books
            SET rag_indexing_started_at = now()
            WHERE id = {bookId}
              AND rag_status = 1
              AND rag_chunk_count = 0
              AND rag_indexing_started_at IS NULL;
            """, ct);
        if (claimed == 0) return;

        try
        {
            // Clear any pre-existing chunks so a requeue / Failed re-claim never doubles rows (this used
            // to live in the endpoint's ShouldClearChunksBeforeChunking block). Harmless no-op when none.
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"DELETE FROM user_chapter_chunk WHERE user_book_id = {bookId};", ct);

            var chunkCount = await chunking.ChunkUserBookAsync(db, bookId, ct);

            var book = await db.UserBooks.FirstOrDefaultAsync(b => b.Id == bookId, ct);
            if (book is null) return; // deleted mid-run

            if (RagIndexLogicIsTerminalFailure(chunkCount))
            {
                book.RagStatus = RagIndexStatus.Failed;
                book.RagChunkCount = 0;
                book.RagEmbeddedCount = 0;
                book.RagError = "No chapters to index";
                book.RagIndexedAt = null;
            }
            else
            {
                // Leave status Indexing — the embedding worker fills the vectors and flips it Ready.
                book.RagChunkCount = chunkCount;
                book.RagEmbeddedCount = 0;
                book.RagError = null;
                book.RagIndexedAt = null;
            }

            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "RAG indexing failed for user book {BookId}", bookId);
            await FailUserBookAsync(bookId, "indexing failed, retry");
        }
    }

    /// <summary>Index one catalog EDITION by id. No-op if it is not currently claimable (queued).</summary>
    public async Task IndexEditionAsync(Guid editionId, CancellationToken ct)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);

        var claimed = await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE editions
            SET rag_indexing_started_at = now()
            WHERE id = {editionId}
              AND rag_status = 1
              AND rag_chunk_count = 0
              AND rag_indexing_started_at IS NULL;
            """, ct);
        if (claimed == 0) return;

        try
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"DELETE FROM chapter_chunk WHERE edition_id = {editionId};", ct);

            var chunkCount = await chunking.ChunkEditionAsync(db, editionId, ct);

            var edition = await db.Editions.FirstOrDefaultAsync(e => e.Id == editionId, ct);
            if (edition is null) return;

            if (RagIndexLogicIsTerminalFailure(chunkCount))
            {
                edition.RagStatus = RagIndexStatus.Failed;
                edition.RagChunkCount = 0;
                edition.RagEmbeddedCount = 0;
                edition.RagError = "No chapters to index";
                edition.RagIndexedAt = null;
            }
            else
            {
                edition.RagChunkCount = chunkCount;
                edition.RagEmbeddedCount = 0;
                edition.RagError = null;
                edition.RagIndexedAt = null;
            }

            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "RAG indexing failed for edition {EditionId}", editionId);
            await FailEditionAsync(editionId, "indexing failed, retry");
        }
    }

    // Best-effort terminal write on the failure/cancellation path, on a FRESH context + CancellationToken.None
    // (the run's ct may already be cancelled — that must NOT stop us stamping the terminal Failed).
    private async Task FailUserBookAsync(Guid bookId, string error)
    {
        try
        {
            await using var db = await dbFactory.CreateDbContextAsync(CancellationToken.None);
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE user_books
                SET rag_status = 3, rag_error = {error}, rag_chunk_count = 0, rag_embedded_count = 0,
                    rag_indexed_at = NULL
                WHERE id = {bookId};
                """, CancellationToken.None);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to persist Failed RAG status for user book {BookId}", bookId);
        }
    }

    private async Task FailEditionAsync(Guid editionId, string error)
    {
        try
        {
            await using var db = await dbFactory.CreateDbContextAsync(CancellationToken.None);
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE editions
                SET rag_status = 3, rag_error = {error}, rag_chunk_count = 0, rag_embedded_count = 0,
                    rag_indexed_at = NULL
                WHERE id = {editionId};
                """, CancellationToken.None);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to persist Failed RAG status for edition {EditionId}", editionId);
        }
    }

    // Thin local alias so the executor reads against the same pure predicate the tests lock.
    private static bool RagIndexLogicIsTerminalFailure(int chunkCount)
        => Application.Rag.RagIndexLogic.IsTerminalFailureAfterChunking(chunkCount);
}
