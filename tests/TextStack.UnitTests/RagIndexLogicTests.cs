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

    // ---- IsQueuedForIndexing: the row the endpoint claimed, waiting for the Worker to chunk ----

    // Indexing + zero chunks + no started stamp = queued; the sweep + executor atomic claim mirror this.
    [Fact]
    public void IsQueuedForIndexing_IndexingZeroChunksNoStamp_ReturnsTrue()
        => Assert.True(RagIndexLogic.IsQueuedForIndexing(RagIndexStatus.Indexing, chunkCount: 0, indexingStartedAt: null));

    // A started stamp means someone already claimed it (in-flight) — not queued.
    [Fact]
    public void IsQueuedForIndexing_HasStartedStamp_ReturnsFalse()
        => Assert.False(RagIndexLogic.IsQueuedForIndexing(
            RagIndexStatus.Indexing, chunkCount: 0, indexingStartedAt: DateTimeOffset.UtcNow));

    // Chunks already exist (embedding in progress) — never re-queue.
    [Fact]
    public void IsQueuedForIndexing_HasChunks_ReturnsFalse()
        => Assert.False(RagIndexLogic.IsQueuedForIndexing(RagIndexStatus.Indexing, chunkCount: 5, indexingStartedAt: null));

    [Theory]
    [InlineData(RagIndexStatus.NotIndexed)]
    [InlineData(RagIndexStatus.Ready)]
    [InlineData(RagIndexStatus.Failed)]
    public void IsQueuedForIndexing_NonIndexingStatus_ReturnsFalse(RagIndexStatus status)
        => Assert.False(RagIndexLogic.IsQueuedForIndexing(status, chunkCount: 0, indexingStartedAt: null));

    // ---- IsStaleIndexing: dead-process recovery → terminal Failed ----

    private static readonly TimeSpan Stale = TimeSpan.FromMinutes(15);

    // Indexing + zero chunks + started stamp older than the window = the claiming process died → stale.
    [Fact]
    public void IsStaleIndexing_OldStamp_ReturnsTrue()
    {
        var now = new DateTimeOffset(2026, 7, 14, 12, 0, 0, TimeSpan.Zero);
        var started = now - TimeSpan.FromMinutes(16);
        Assert.True(RagIndexLogic.IsStaleIndexing(RagIndexStatus.Indexing, 0, started, now, Stale));
    }

    // Still inside the window — a legitimately long vision parse, not stale.
    [Fact]
    public void IsStaleIndexing_RecentStamp_ReturnsFalse()
    {
        var now = new DateTimeOffset(2026, 7, 14, 12, 0, 0, TimeSpan.Zero);
        var started = now - TimeSpan.FromMinutes(5);
        Assert.False(RagIndexLogic.IsStaleIndexing(RagIndexStatus.Indexing, 0, started, now, Stale));
    }

    // Never claimed (no stamp) → not stale (it's queued, handled by the drain path instead).
    [Fact]
    public void IsStaleIndexing_NoStamp_ReturnsFalse()
    {
        var now = new DateTimeOffset(2026, 7, 14, 12, 0, 0, TimeSpan.Zero);
        Assert.False(RagIndexLogic.IsStaleIndexing(RagIndexStatus.Indexing, 0, null, now, Stale));
    }

    // Already has chunks (embedding in progress) → not a dead index attempt.
    [Fact]
    public void IsStaleIndexing_HasChunks_ReturnsFalse()
    {
        var now = new DateTimeOffset(2026, 7, 14, 12, 0, 0, TimeSpan.Zero);
        var started = now - TimeSpan.FromMinutes(30);
        Assert.False(RagIndexLogic.IsStaleIndexing(RagIndexStatus.Indexing, 7, started, now, Stale));
    }

    [Theory]
    [InlineData(RagIndexStatus.NotIndexed)]
    [InlineData(RagIndexStatus.Ready)]
    [InlineData(RagIndexStatus.Failed)]
    public void IsStaleIndexing_NonIndexingStatus_ReturnsFalse(RagIndexStatus status)
    {
        var now = new DateTimeOffset(2026, 7, 14, 12, 0, 0, TimeSpan.Zero);
        var started = now - TimeSpan.FromMinutes(30);
        Assert.False(RagIndexLogic.IsStaleIndexing(status, 0, started, now, Stale));
    }

    // ---- IsTerminalFailureAfterChunking: no chunks produced → terminal Failed ----

    [Fact]
    public void IsTerminalFailureAfterChunking_ZeroChunks_ReturnsTrue()
        => Assert.True(RagIndexLogic.IsTerminalFailureAfterChunking(0));

    [Fact]
    public void IsTerminalFailureAfterChunking_HasChunks_ReturnsFalse()
        => Assert.False(RagIndexLogic.IsTerminalFailureAfterChunking(3));

    // ---- ResolveStatusAfterChunking (#4): don't blind-reset embedded_count; flip Ready if already full ----

    // Normal case: the embedder hasn't touched the fresh chunks yet (0 embedded) → stay Indexing so it drains.
    [Fact]
    public void ResolveStatusAfterChunking_NoneEmbedded_ReturnsIndexing()
        => Assert.Equal(RagIndexStatus.Indexing, RagIndexLogic.ResolveStatusAfterChunking(chunkCount: 8, embeddedCount: 0));

    // Race: the embedder filled some but not all before the stamp → still Indexing (it drains the rest).
    [Fact]
    public void ResolveStatusAfterChunking_PartiallyEmbedded_ReturnsIndexing()
        => Assert.Equal(RagIndexStatus.Indexing, RagIndexLogic.ResolveStatusAfterChunking(chunkCount: 8, embeddedCount: 3));

    // Race won fully: every chunk already embedded before the stamp → flip Ready HERE (no NULL chunk
    // remains to re-trigger the embedder's flip, so leaving it Indexing would strand forever). Mirrors IsReady.
    [Fact]
    public void ResolveStatusAfterChunking_AllEmbedded_ReturnsReady()
        => Assert.Equal(RagIndexStatus.Ready, RagIndexLogic.ResolveStatusAfterChunking(chunkCount: 8, embeddedCount: 8));

    // ---- ResolveParseTimeout (QA #3): hard cap on one vision parse; bad config can't disable it ----

    [Fact]
    public void ResolveParseTimeout_PositiveMinutes_ReturnsThatDuration()
        => Assert.Equal(TimeSpan.FromMinutes(8), RagIndexLogic.ResolveParseTimeout(8));

    [Fact]
    public void ResolveParseTimeout_DefaultConfigValue_ReturnsTwelveMinutes()
        => Assert.Equal(TimeSpan.FromMinutes(12), RagIndexLogic.ResolveParseTimeout(12));

    // A missing / misconfigured (non-positive) value must fall back to the default — never 0/negative,
    // which would fire the timeout instantly (or never) and re-open the forever-hung parse QA #3 fixes.
    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public void ResolveParseTimeout_NonPositive_FallsBackToDefault(int configured)
        => Assert.Equal(RagIndexLogic.DefaultParseTimeout, RagIndexLogic.ResolveParseTimeout(configured));

    // Load-bearing ordering invariant: the parse timeout MUST be strictly less than the sweep's 15-min
    // StaleAfter (RagIndexingWorker.StaleAfter) so a live-but-slow parse is failed by its own timeout
    // BEFORE the stale sweep would reclaim it — no stale-vs-live race.
    [Fact]
    public void DefaultParseTimeout_IsLessThanStaleWindow()
        => Assert.True(RagIndexLogic.DefaultParseTimeout < TimeSpan.FromMinutes(15));
}
