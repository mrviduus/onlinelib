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
///   (user library is the product focus). The chunk is <b>DETACHED</b> from the sweep loop and bounded
///   to ONE concurrent parse overall by a <see cref="SemaphoreSlim"/> (QA #3): a slow/hung vision parse
///   used to be awaited inline and blocked the WHOLE loop — including stale-reclaim (b) — until it
///   returned (a mis-routed 74-min parse wedged the worker on prod). Now (b) + these cheap drain SELECTs
///   run EVERY 30s regardless of parse state; the per-row atomic claim in <see cref="RagIndexingService"/>
///   still guards a double pick, and the semaphore bounds paid vision spend to one parse at a time.</item>
/// </list>
/// The embedding worker still owns the chunk_count&gt;0 → embed → Ready handoff (untouched).
/// <para><b>Single-Worker assumption unchanged.</b> The atomic claim + stale sweep still assume ONE
/// Worker instance. <b>Restart safety unchanged:</b> a detached task dies on worker restart, but the
/// executor stamps <c>rag_indexing_started_at</c> BEFORE the long parse, so the 15-min stale sweep
/// reclaims it — this is why detach-in-Worker is safe (unlike an API fire-and-forget with no durable
/// claim).</para>
/// </summary>
public class RagIndexingWorker(
    IDbContextFactory<AppDbContext> dbFactory,
    RagIndexingService indexingService,
    ILogger<RagIndexingWorker> logger) : BackgroundService
{
    // Re-trigger latency for the (cheap) claim query. The chunk itself is DETACHED (Task.Run) and bounded
    // to one concurrent parse by _parseSlot, so this loop stays responsive even mid-parse (QA #3).
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);
    // An Indexing row untouched for this long means the process that claimed it died mid-chunk.
    private static readonly TimeSpan StaleAfter = TimeSpan.FromMinutes(15);

    // Bounds paid vision spend to ONE parse at a time across BOTH corpora and keeps the detached chunk
    // off the sweep loop. Wait(0) is non-blocking: a busy slot ⇒ skip starting another this cycle.
    private readonly SemaphoreSlim _parseSlot = new(1, 1);

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

        // (a) Drain a queued row — user books first (product focus), then editions. Gated on a free parse
        // slot so at most ONE parse runs at a time across both corpora. If a parse is already in flight we
        // skip the drain this cycle — (b) stale-reclaim above already ran, so the loop stays responsive.
        // ct here is the worker stoppingToken (ExecuteAsync passes it straight through), which the detached
        // task reuses so it is NOT cancelled at end-of-cycle. Guards mirror RagIndexLogic.IsQueuedForIndexing;
        // the executor's atomic claim makes the pick safe.
        if (!_parseSlot.Wait(0))
            return;

        // We now OWN the slot; it MUST be released on every path — synchronously if nothing is queued,
        // or in the detached task's finally if we dispatch one.
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
            DispatchDetached(
                () => indexingService.IndexUserBookAsync(userBookId.Value, ct), $"user book {userBookId}");
            return; // slot released by the detached task
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
        {
            DispatchDetached(
                () => indexingService.IndexEditionAsync(editionId.Value, ct), $"edition {editionId}");
            return; // slot released by the detached task
        }

        // Nothing queued — release the slot so the next cycle can claim it.
        _parseSlot.Release();
    }

    // Runs one index attempt OFF the sweep loop (QA #3) so a slow/hung vision parse can't block the next
    // stale-reclaim / drain. Deliberately NOT passing stoppingToken to Task.Run: a Task.Run with an
    // already-cancelled token never runs the delegate → the finally never releases the slot. The token is
    // threaded to the executor call instead (captured in `index`), so shutdown still cancels the parse
    // while the slot is always released here. Executor faults are logged, never rethrown (nothing awaits).
    private void DispatchDetached(Func<Task> index, string what)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                await index();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Detached RAG indexing failed for {What}", what);
            }
            finally
            {
                _parseSlot.Release();
            }
        });
    }
}
