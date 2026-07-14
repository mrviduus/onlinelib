using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Worker.Services;

/// <summary>
/// Sweep that keeps on-demand "Ask this book" RAG indexing off the HTTP path and durable (analog of
/// <see cref="MetadataEnrichmentWorker"/>). Each cycle:
/// <list type="bullet">
///   <item>(b) <b>reclaims stale rows</b> — a row still <c>Indexing</c> with zero chunks whose
///   <c>rag_indexing_started_at</c> is older than <see cref="StaleAfter"/> means the process that
///   claimed it died mid-chunk. It is flipped to a terminal <c>Failed</c> (<c>rag_error =
///   "indexing interrupted, retry"</c>) — NOT auto-requeued: a large vision parse is real paid spend,
///   so the user re-triggers deliberately. This is the dead-process recovery that kills the
///   forever-Indexing dead end.</item>
///   <item>(a) <b>drains one queued row</b> — a row the endpoint just claimed
///   (<c>Indexing</c>, zero chunks, no started stamp). User books take priority over catalog editions
///   (user library is the product focus), and only ONE book is indexed per cycle (BatchSize = 1) to
///   bound concurrent paid vision spend; the per-row atomic claim in <see cref="RagIndexingService"/>
///   guards against a double pick.</item>
/// </list>
/// The embedding worker still owns the chunk_count&gt;0 → embed → Ready handoff (untouched).
/// </summary>
public class RagIndexingWorker(
    IDbContextFactory<AppDbContext> dbFactory,
    RagIndexingService indexingService,
    ILogger<RagIndexingWorker> logger) : BackgroundService
{
    // Re-trigger latency for the (cheap) claim query; the actual chunk runs inline and naturally
    // serializes the loop (a minutes-long vision parse blocks the next cycle → at most one at a time).
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);
    // An Indexing row untouched for this long means the process that claimed it died mid-chunk.
    private static readonly TimeSpan StaleAfter = TimeSpan.FromMinutes(15);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation(
            "RAG indexing worker started (interval: {Interval}, stale: {Stale})", Interval, StaleAfter);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SweepAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error during RAG indexing sweep");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }

    private async Task SweepAsync(CancellationToken ct)
    {
        var staleCutoff = DateTimeOffset.UtcNow - StaleAfter;

        // (b) Dead-process recovery: terminal Failed for stale Indexing rows in BOTH corpora. Guard
        // mirrors RagIndexLogic.IsStaleIndexing. Do NOT auto-requeue (deliberate re-trigger by user).
        await using (var db = await dbFactory.CreateDbContextAsync(ct))
        {
            var staleBooks = await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE user_books
                SET rag_status = 3, rag_error = 'indexing interrupted, retry'
                WHERE rag_status = 1 AND rag_chunk_count = 0
                  AND rag_indexing_started_at < {staleCutoff};
                """, ct);
            var staleEditions = await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE editions
                SET rag_status = 3, rag_error = 'indexing interrupted, retry'
                WHERE rag_status = 1 AND rag_chunk_count = 0
                  AND rag_indexing_started_at < {staleCutoff};
                """, ct);
            if (staleBooks + staleEditions > 0)
                logger.LogWarning(
                    "Failed {Books} stale user-book + {Editions} stale edition indexing row(s)",
                    staleBooks, staleEditions);
        }

        // (a) Drain ONE queued row per cycle — user books first (product focus), then editions. Guard
        // mirrors RagIndexLogic.IsQueuedForIndexing; the executor's atomic claim makes the pick safe.
        Guid? userBookId;
        await using (var db = await dbFactory.CreateDbContextAsync(ct))
        {
            userBookId = await db.UserBooks
                .Where(b => b.RagStatus == Domain.Enums.RagIndexStatus.Indexing
                            && b.RagChunkCount == 0
                            && b.RagIndexingStartedAt == null)
                .OrderBy(b => b.UpdatedAt)
                .Select(b => (Guid?)b.Id)
                .FirstOrDefaultAsync(ct);
        }

        if (userBookId is not null)
        {
            await indexingService.IndexUserBookAsync(userBookId.Value, ct);
            return; // one book per cycle bounds concurrent vision spend
        }

        Guid? editionId;
        await using (var db = await dbFactory.CreateDbContextAsync(ct))
        {
            editionId = await db.Editions
                .Where(e => e.RagStatus == Domain.Enums.RagIndexStatus.Indexing
                            && e.RagChunkCount == 0
                            && e.RagIndexingStartedAt == null)
                .OrderBy(e => e.UpdatedAt)
                .Select(e => (Guid?)e.Id)
                .FirstOrDefaultAsync(ct);
        }

        if (editionId is not null)
            await indexingService.IndexEditionAsync(editionId.Value, ct);
    }
}
