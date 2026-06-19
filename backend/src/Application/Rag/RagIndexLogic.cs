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
}
