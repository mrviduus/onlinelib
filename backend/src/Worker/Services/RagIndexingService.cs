using Application.Rag;
using Domain.Enums;
using Infrastructure.Persistence;
using Infrastructure.Rag;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
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
    IConfiguration config,
    ILogger<RagIndexingService> logger)
{
    // QA #3: hard cap on a single vision parse so a hung OpenAI/vision call can't run forever. Read once
    // (matches how Ai:Pdf:MaxParsePages is read in PdfVisionParser). MUST stay < the sweep's stale window
    // (RagIndexLogic.StaleWindow) — the timeout terminates a live-but-slow parse to Failed HERE, before the
    // stale sweep would reclaim it (avoids the stale-vs-live race). ResolveParseTimeout floors a non-positive
    // config to the 12-min default AND clamps an over-large one beneath the stale window (F2), so the cap can
    // never be accidentally disabled OR pushed past the stale sweep. ResolveParseTimeoutWithWarning logs once
    // (at construction) when a configured value was clamped, so a misconfig is visible in logs, not silent.
    private readonly TimeSpan _parseTimeout = ResolveParseTimeoutWithWarning(config, logger);

    private static TimeSpan ResolveParseTimeoutWithWarning(IConfiguration config, ILogger<RagIndexingService> logger)
    {
        var configuredMinutes = config.GetValue("Ai:Pdf:ParseTimeoutMinutes", 12);
        var resolved = RagIndexLogic.ResolveParseTimeout(configuredMinutes);
        if (RagIndexLogic.ParseTimeoutWasClamped(configuredMinutes))
            logger.LogWarning(
                "Ai:Pdf:ParseTimeoutMinutes={Configured} exceeds the {Cap}-min cap (must stay under the "
                + "{Stale}-min stale window); clamped to {Resolved}",
                configuredMinutes, RagIndexLogic.MaxParseTimeout.TotalMinutes,
                RagIndexLogic.StaleWindow.TotalMinutes, resolved);
        return resolved;
    }

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

            // QA #3: bound the parse with a linked timeout token. When it fires, the chunker's ct is
            // cancelled → it either throws (caught below) or swallows-and-returns 0 (disambiguated below).
            using var parseCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            parseCts.CancelAfter(_parseTimeout);

            int chunkCount;
            try
            {
                chunkCount = await chunking.ChunkUserBookAsync(db, bookId, parseCts.Token);
            }
            catch (OperationCanceledException) when (parseCts.IsCancellationRequested && !ct.IsCancellationRequested)
            {
                // Timeout fired (NOT worker shutdown): terminal Failed, retry-able. Fresh-context write.
                await FailUserBookAsync(bookId, "indexing timed out, retry");
                return;
            }

            if (RagIndexLogicIsTerminalFailure(chunkCount))
            {
                // The chunker swallows an OperationCanceledException and returns 0 — indistinguishable
                // from a genuinely empty book by the count alone. Disambiguate before the "empty" write:
                //   - parse timeout fired (QA #3): retry-able "timed out" (checked first — on shutdown
                //     BOTH tokens are cancelled, so timeout-only means parseCts && !ct).
                //   - Fix #8: worker shutdown (ct cancelled): retry-able "interrupted", not empty.
                //   - otherwise: genuinely no chapters.
                if (parseCts.IsCancellationRequested && !ct.IsCancellationRequested)
                {
                    await FailUserBookAsync(bookId, "indexing timed out, retry");
                    return;
                }

                if (ct.IsCancellationRequested)
                {
                    await FailUserBookAsync(bookId, "indexing interrupted, retry");
                    return;
                }

                await FailUserBookAsync(bookId, "No chapters to index");
                return;
            }

            // Fix #2 + #4: guarded, recomputing final stamp. `AND rag_status = 1` re-asserts the row is
            // still Indexing — a stale-sweep (single-worker model; the sweep/claim assumes ONE Worker
            // instance) could have flipped it Failed mid-parse, and writing chunk_count>0 onto a Failed
            // row would strand it (embedder ignores Failed). rag_embedded_count is recomputed from the
            // actual chunk rows (NOT hardcoded 0) because the embedder can race ahead of this stamp; and
            // if every chunk is already embedded we flip straight to Ready (mirrors the embedder's flip)
            // so no stranded Indexing remains. rowcount 0 ⇒ we lost the row → do nothing.
            var stamped = await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE user_books b
                SET rag_chunk_count = {chunkCount},
                    rag_embedded_count = sub.embedded,
                    rag_error = NULL,
                    rag_status = CASE WHEN sub.embedded = {chunkCount} THEN 2 ELSE 1 END,
                    rag_indexed_at = CASE WHEN sub.embedded = {chunkCount} THEN now() ELSE NULL END
                FROM (
                    SELECT count(*) FILTER (WHERE embedding IS NOT NULL) AS embedded
                    FROM user_chapter_chunk
                    WHERE user_book_id = {bookId}
                ) sub
                WHERE b.id = {bookId} AND b.rag_status = 1;
                """, ct);

            if (stamped == 0)
                logger.LogWarning(
                    "RAG indexing lost the row for user book {BookId} (no longer Indexing); skipping stamp", bookId);
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

            // QA #3: bound the parse with a linked timeout token (see IndexUserBookAsync for the rationale).
            using var parseCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            parseCts.CancelAfter(_parseTimeout);

            int chunkCount;
            try
            {
                chunkCount = await chunking.ChunkEditionAsync(db, editionId, parseCts.Token);
            }
            catch (OperationCanceledException) when (parseCts.IsCancellationRequested && !ct.IsCancellationRequested)
            {
                await FailEditionAsync(editionId, "indexing timed out, retry");
                return;
            }

            if (RagIndexLogicIsTerminalFailure(chunkCount))
            {
                // Disambiguate a swallowed-cancellation 0 (see IndexUserBookAsync): timeout (QA #3) →
                // "timed out"; Fix #8 shutdown → "interrupted"; else genuinely empty edition.
                if (parseCts.IsCancellationRequested && !ct.IsCancellationRequested)
                {
                    await FailEditionAsync(editionId, "indexing timed out, retry");
                    return;
                }

                if (ct.IsCancellationRequested)
                {
                    await FailEditionAsync(editionId, "indexing interrupted, retry");
                    return;
                }

                await FailEditionAsync(editionId, "No chapters to index");
                return;
            }

            // Fix #2 + #4: guarded, recomputing final stamp (see IndexUserBookAsync for the rationale —
            // single-worker sweep/claim model). `AND rag_status = 1` guards against a stale-sweep flip;
            // rag_embedded_count is recomputed from the chunk rows and the row flips Ready if already fully
            // embedded. rowcount 0 ⇒ lost the row → do nothing.
            var stamped = await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE editions e
                SET rag_chunk_count = {chunkCount},
                    rag_embedded_count = sub.embedded,
                    rag_error = NULL,
                    rag_status = CASE WHEN sub.embedded = {chunkCount} THEN 2 ELSE 1 END,
                    rag_indexed_at = CASE WHEN sub.embedded = {chunkCount} THEN now() ELSE NULL END
                FROM (
                    SELECT count(*) FILTER (WHERE embedding IS NOT NULL) AS embedded
                    FROM chapter_chunk
                    WHERE edition_id = {editionId}
                ) sub
                WHERE e.id = {editionId} AND e.rag_status = 1;
                """, ct);

            if (stamped == 0)
                logger.LogWarning(
                    "RAG indexing lost the row for edition {EditionId} (no longer Indexing); skipping stamp", editionId);
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
