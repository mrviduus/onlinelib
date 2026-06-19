using Application.Rag;
using Domain.Enums;

namespace TextStack.UnitTests;

/// <summary>
/// Phase 1 on-demand "Ask this book" indexing: the load-bearing state transitions. The endpoint's
/// atomic claim SQL (<c>WHERE rag_status IN (0,3)</c>) and the embedding worker's Ready-flip SQL
/// (<c>embedded = chunk AND chunk &gt; 0</c>) mirror these pure predicates — locking them here
/// catches a regression in a fast test rather than only against the live DB.
/// </summary>
public class RagIndexLogicTests
{
    // ---- CanClaim: claim transition ----

    [Theory]
    [InlineData(RagIndexStatus.NotIndexed)]
    [InlineData(RagIndexStatus.Failed)]
    public void CanClaim_NotIndexedOrFailed_ReturnsTrue(RagIndexStatus status)
        => Assert.True(RagIndexLogic.CanClaim(status));

    [Theory]
    [InlineData(RagIndexStatus.Indexing)]
    [InlineData(RagIndexStatus.Ready)]
    public void CanClaim_IndexingOrReady_ReturnsFalse(RagIndexStatus status)
        => Assert.False(RagIndexLogic.CanClaim(status));

    // ---- ShouldClearChunksBeforeChunking: every claim clears pre-existing chunks before re-chunk ----

    // Both claimable priors must clear: Failed (stale partials) AND NotIndexed (legacy AI-019
    // editions already carry chunks but were defaulted to NotIndexed by the migration). Not clearing
    // on NotIndexed is the P1 double-chunk/double-embed/stuck-Indexing bug.
    [Theory]
    [InlineData(RagIndexStatus.Failed)]
    [InlineData(RagIndexStatus.NotIndexed)]
    public void ShouldClearChunksBeforeChunking_ClaimablePrior_ReturnsTrue(RagIndexStatus status)
        => Assert.True(RagIndexLogic.ShouldClearChunksBeforeChunking(status));

    // Indexing/Ready never reach the clear step (they no-op at the claim guard), but lock the
    // predicate so a refactor that routes them here can't wipe a good index.
    [Theory]
    [InlineData(RagIndexStatus.Indexing)]
    [InlineData(RagIndexStatus.Ready)]
    public void ShouldClearChunksBeforeChunking_NonClaimable_ReturnsFalse(RagIndexStatus status)
        => Assert.False(RagIndexLogic.ShouldClearChunksBeforeChunking(status));

    // ---- IsReady: flip predicate ----

    [Fact]
    public void IsReady_AllChunksEmbedded_ReturnsTrue()
        => Assert.True(RagIndexLogic.IsReady(embeddedCount: 12, chunkCount: 12));

    [Fact]
    public void IsReady_PartiallyEmbedded_ReturnsFalse()
        => Assert.False(RagIndexLogic.IsReady(embeddedCount: 5, chunkCount: 12));

    [Fact]
    public void IsReady_ZeroChunks_ReturnsFalse()
        => Assert.False(RagIndexLogic.IsReady(embeddedCount: 0, chunkCount: 0));

    [Fact]
    public void IsReady_EmbeddedExceedsChunkCount_ReturnsFalse()
        => Assert.False(RagIndexLogic.IsReady(embeddedCount: 13, chunkCount: 12));
}
