using Domain.Enums;

namespace Application.Rag;

/// <summary>
/// Pure decision logic for on-demand "Ask this book" indexing (Phase 1). Kept framework-free and
/// side-effect-free so the load-bearing state transitions are unit-testable without a DB. The
/// endpoint + embedding worker run the equivalent guarded SQL; these predicates mirror those guards
/// so a regression is caught in a fast test rather than only against pgvector.
/// </summary>
public static class RagIndexLogic
{
    /// <summary>
    /// A trigger may CLAIM an edition for indexing only from <see cref="RagIndexStatus.NotIndexed"/>
    /// or <see cref="RagIndexStatus.Failed"/>. Already-Indexing/Ready editions are a no-op (return
    /// current status). This mirrors the atomic <c>WHERE rag_status IN (0, 3)</c> claim in SQL.
    /// </summary>
    public static bool CanClaim(RagIndexStatus status)
        => status is RagIndexStatus.NotIndexed or RagIndexStatus.Failed;

    /// <summary>
    /// Before (re-)chunking a claimed edition we must delete any pre-existing <c>chapter_chunk</c>
    /// rows, otherwise <c>ChunkEditionAsync</c> AddRange's a second full set → duplicate chunks,
    /// double embed spend, and a chunk_count that never matches embedded_count (Ready never flips).
    /// This is true for BOTH claimable priors:
    /// <list type="bullet">
    ///   <item><see cref="RagIndexStatus.Failed"/> — clears stale partial chunks from the prior run.</item>
    ///   <item><see cref="RagIndexStatus.NotIndexed"/> — legacy editions ingested under AI-019 already
    ///   carry chunks but were defaulted to NotIndexed by the migration; a truly-fresh edition has
    ///   none so the DELETE is a harmless no-op.</item>
    /// </list>
    /// Only the two claimable states are ever reached here (Indexing/Ready no-op before this point).
    /// </summary>
    public static bool ShouldClearChunksBeforeChunking(RagIndexStatus priorStatus)
        => priorStatus is RagIndexStatus.NotIndexed or RagIndexStatus.Failed;

    /// <summary>
    /// An edition is fully embedded (→ flip to <see cref="RagIndexStatus.Ready"/>) exactly when its
    /// embedded-chunk count equals its total chunk count AND it has at least one chunk. The
    /// <c>chunkCount &gt; 0</c> guard prevents a chunk-less edition (0 == 0) from flipping Ready.
    /// </summary>
    public static bool IsReady(int embeddedCount, int chunkCount)
        => chunkCount > 0 && embeddedCount == chunkCount;

    /// <summary>
    /// A row is QUEUED for the worker to chunk when the endpoint has claimed it
    /// (<see cref="RagIndexStatus.Indexing"/>) but no chunking has run yet: zero chunks AND no
    /// indexing-started stamp. The worker's sweep selects these; its per-row atomic claim
    /// (<c>SET rag_indexing_started_at = now() WHERE rag_status = 1 AND rag_chunk_count = 0 AND
    /// rag_indexing_started_at IS NULL</c>) mirrors exactly this predicate, so the loser of a double
    /// pick sees rowcount 0. The chunk_count guard keeps an already-chunked (embedding-in-progress)
    /// row from being re-queued.
    /// </summary>
    public static bool IsQueuedForIndexing(RagIndexStatus status, int chunkCount, DateTimeOffset? indexingStartedAt)
        => status == RagIndexStatus.Indexing && chunkCount == 0 && indexingStartedAt is null;

    /// <summary>
    /// A row is STALE (its claiming process died mid-chunk) when it is still
    /// <see cref="RagIndexStatus.Indexing"/> with zero chunks but its indexing-started stamp is older
    /// than <paramref name="staleAfter"/>. The sweep flips these to a terminal
    /// <see cref="RagIndexStatus.Failed"/> — it does NOT auto-requeue (a large vision parse is real paid
    /// spend; the user re-triggers deliberately). This is the core "no forever-Indexing dead end" fix.
    /// </summary>
    public static bool IsStaleIndexing(
        RagIndexStatus status, int chunkCount, DateTimeOffset? indexingStartedAt,
        DateTimeOffset now, TimeSpan staleAfter)
        => status == RagIndexStatus.Indexing
           && chunkCount == 0
           && indexingStartedAt is not null
           && indexingStartedAt < now - staleAfter;

    /// <summary>
    /// After the executor has run the chunker, the index attempt is a TERMINAL FAILURE when it produced
    /// no chunks (nothing to embed → the embedder can never flip it Ready). The executor sets
    /// <see cref="RagIndexStatus.Failed"/> with an error; a positive count leaves the row Indexing for
    /// the embedder to complete.
    /// </summary>
    public static bool IsTerminalFailureAfterChunking(int chunkCount)
        => chunkCount == 0;

    /// <summary>
    /// The status the executor stamps after a NON-empty chunk run (chunkCount &gt; 0), given how many of
    /// those chunks are ALREADY embedded. Normally none are, so the row stays <see cref="RagIndexStatus.Indexing"/>
    /// for the embedding worker to drain. But the embedder can race ahead and fill some (or all) chunks
    /// before the executor stamps <c>rag_chunk_count</c>; if it already embedded every chunk we must flip
    /// straight to <see cref="RagIndexStatus.Ready"/> here (mirroring the embedder's own Ready predicate,
    /// <see cref="IsReady"/>) — otherwise no un-embedded chunk remains to re-trigger that flip and the row
    /// strands Indexing forever. Blind-resetting <c>embedded_count</c> to 0 would hit the same trap, so the
    /// executor recomputes it from the actual chunk rows and feeds it here.
    /// </summary>
    public static RagIndexStatus ResolveStatusAfterChunking(int chunkCount, int embeddedCount)
        => IsReady(embeddedCount, chunkCount) ? RagIndexStatus.Ready : RagIndexStatus.Indexing;
}
