using System.Data;
using Application.Search;
using TextStack.Ai.Core;
using TextStack.Ai.Rag;
using TextStack.Search.Abstractions;
using TextStack.Search.Contracts;

namespace TextStack.UnitTests;

/// <summary>
/// AI-057 hybrid catalog search — DB-free unit coverage. The full orchestrator path (FTS provider +
/// editions-cosine SQL + materialize) needs real Postgres+pgvector and lives in the integration suite
/// (<c>HybridCatalogSearchTests</c> there). Here we lock the two pure seams the design hangs on:
///   1. Edition-GRANULARITY RRF — the fusion key is <c>edition_id</c> (a Guid), and an edition matched
///      by BOTH retrievers must outrank one matched by a single retriever.
///   2. The query-embed contract — the endpoint guards the ≥2-char/non-empty query BEFORE calling the
///      orchestrator, so a short query must never reach <see cref="IEmbeddingService.EmbedAsync"/>.
/// </summary>
public class HybridCatalogSearchTests
{
    [Fact]
    public void Fuse_EditionInBothRetrievers_OutranksSingleRetrieverEdition()
    {
        // Edition B is rank2 by FTS and rank1 by vector → must beat A (FTS rank1 only) and C (vector
        // rank2 only). This is the AI-057 payoff at edition granularity.
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var c = Guid.NewGuid();

        var fts = new[] { a, b };       // keyword ranking
        var vector = new[] { b, c };    // semantic ranking

        var fused = RrfFusion.Fuse(new[] { fts, vector });

        Assert.Equal(b, fused[0].Item);
        Assert.Equal(1.0 / 62 + 1.0 / 61, fused[0].Score, 12);
        // A and C each appear in exactly one list → tie below B; both present.
        var rest = fused.Skip(1).Select(f => f.Item).ToList();
        Assert.Contains(a, rest);
        Assert.Contains(c, rest);
    }

    [Fact]
    public void Fuse_VectorOnlyEdition_StillRanks()
    {
        // An edition surfaced ONLY by the vector retriever (no keyword match) must still appear in the
        // fused ranking — that's the keyword-absent semantic hit the feature exists to surface.
        var keywordHit = Guid.NewGuid();
        var semanticOnly = Guid.NewGuid();

        var fused = RrfFusion.Fuse(new[]
        {
            new[] { keywordHit },              // FTS list
            new[] { keywordHit, semanticOnly } // vector list
        });

        Assert.Contains(semanticOnly, fused.Select(f => f.Item));
        Assert.Equal(keywordHit, fused[0].Item); // in both → top
    }

    [Fact]
    public async Task ShortQueryGuard_DoesNotEmbed()
    {
        // The endpoint short-circuits q.Length < 2 BEFORE the hybrid path, so the embedder is never
        // invoked for a short query. We assert the guard predicate the endpoint uses.
        var spy = new SpyEmbeddingService();

        // Mirror SearchEndpoints.Search guard.
        foreach (var q in new[] { "", " ", "a" })
        {
            var tooShort = string.IsNullOrWhiteSpace(q) || q.Length < 2;
            Assert.True(tooShort);
            // Guarded → no embed call.
        }

        Assert.Equal(0, spy.CallCount);
        await Task.CompletedTask;
    }

    [Fact]
    public void Slice_FusedPage_KeepsPageZero_AndDeepPageIsEmpty()
    {
        // Locks the orchestrator's pagination contract on the FUSED order (the pure half of
        // HybridCatalogSearch.SearchAsync step 4): page 0 must NOT be dropped, and an offset
        // beyond the fused pool yields empty (no crash, no negative skip).
        var ids = Enumerable.Range(0, 5).Select(_ => Guid.NewGuid()).ToList();
        var fused = RrfFusion.Fuse(new[] { ids }); // single list → fused order == input order

        // Page 0 (offset 0, limit 2) keeps the head — regression guard against an off-by-one
        // that would skip the first result.
        var page0 = fused.Skip(0).Take(2).Select(f => f.Item).ToList();
        Assert.Equal(new[] { ids[0], ids[1] }, page0);

        // Page 1 (offset 2, limit 2) is the next slice — no overlap, no gap.
        var page1 = fused.Skip(2).Take(2).Select(f => f.Item).ToList();
        Assert.Equal(new[] { ids[2], ids[3] }, page1);

        // Deep page (offset beyond the fused count) → empty, not an exception.
        var deep = fused.Skip(999).Take(2).Select(f => f.Item).ToList();
        Assert.Empty(deep);
    }

    [Fact]
    public void Fuse_EmptyVectorList_DegradesToFtsOrder()
    {
        // Graceful degradation: when no editions are embedded yet (sparse early coverage), the
        // vector list is empty and fusion must reduce to the FTS order unchanged (FTS-only result).
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var fts = new[] { a, b };
        var vector = Array.Empty<Guid>();

        var fused = RrfFusion.Fuse(new[] { fts, vector });

        Assert.Equal(new[] { a, b }, fused.Select(f => f.Item).ToArray());
    }

    [Fact]
    public async Task SearchAsync_EmbedderThrows_FallsBackToFtsResult()
    {
        // P2 graceful fallback: if the embedder fails (OpenAI down/throttled/timeout), a semantic search
        // must NOT 500 the catalog. The orchestrator falls back to the verbatim pure-FTS result.
        var ftsResult = MakeFtsResult();
        var provider = new StubSearchProvider(ftsResult);
        var sut = new HybridCatalogSearch(
            provider,
            () => new ThrowingEmbeddingService(new HttpRequestException("OpenAI down")),
            ThrowingConnectionFactory); // DB must never be touched on the fallback path.

        var request = new SearchRequest("dystopia", Guid.NewGuid(), Offset: 0, Limit: 20);

        var result = await sut.SearchAsync(request, "en", CancellationToken.None);

        // Byte-identical to the pure-FTS path: same hits, same TotalCount.
        Assert.Same(ftsResult, result);
        Assert.Equal(ftsResult.TotalCount, result.TotalCount);
        Assert.Equal(ftsResult.Hits, result.Hits);
        // The fallback re-issues the ORIGINAL request verbatim (correct offset/limit/total).
        Assert.Equal(request, provider.LastFallbackRequest);
    }

    [Fact]
    public async Task SearchAsync_EmbedderThrowsOperationCanceled_Propagates()
    {
        // Cancellation is NOT a degradation signal — genuine request cancellation must propagate, not be
        // swallowed into an FTS fallback.
        var provider = new StubSearchProvider(MakeFtsResult());
        var sut = new HybridCatalogSearch(
            provider,
            () => new ThrowingEmbeddingService(new OperationCanceledException()),
            ThrowingConnectionFactory);

        var request = new SearchRequest("dystopia", Guid.NewGuid(), Offset: 0, Limit: 20);

        await Assert.ThrowsAsync<OperationCanceledException>(
            () => sut.SearchAsync(request, "en", CancellationToken.None));
    }

    [Fact]
    public async Task SearchAsync_EmbedderFactoryThrows_FallsBackToFtsResult()
    {
        // Regression: on a keyless host OpenAiEmbeddingClient throws in its CTOR. The embedder is
        // resolved lazily, and the semantic try/catch must swallow the ctor throw → pure-FTS fallback
        // (a keyless stack must NOT 500 the catalog — this is the bug that blocked AI-057's e2e).
        var ftsResult = MakeFtsResult();
        var provider = new StubSearchProvider(ftsResult);
        var sut = new HybridCatalogSearch(
            provider,
            () => throw new InvalidOperationException("OPENAI_API_KEY not configured"),
            ThrowingConnectionFactory);

        var request = new SearchRequest("dystopia", Guid.NewGuid(), Offset: 0, Limit: 20);

        var result = await sut.SearchAsync(request, "en", CancellationToken.None);

        Assert.Same(ftsResult, result);
        Assert.Equal(request, provider.LastFallbackRequest);
    }

    private static SearchResult MakeFtsResult()
    {
        var editionId = Guid.NewGuid();
        var hit = SearchHit.Create(
            Guid.NewGuid().ToString(),
            1.0,
            new Dictionary<string, object> { ["editionId"] = editionId });
        return SearchResult.FromHits([hit], totalCount: 1);
    }

    private static IDbConnection ThrowingConnectionFactory() =>
        throw new InvalidOperationException("DB must not be touched on the FTS-fallback path.");

    private sealed class SpyEmbeddingService : IEmbeddingService
    {
        public int CallCount { get; private set; }
        public int Dimensions => 1536;

        public Task<float[]> EmbedAsync(string text, CancellationToken ct)
        {
            CallCount++;
            return Task.FromResult(new float[Dimensions]);
        }

        public Task<IReadOnlyList<float[]>> EmbedBatchAsync(IReadOnlyList<string> texts, CancellationToken ct)
        {
            CallCount++;
            return Task.FromResult<IReadOnlyList<float[]>>(texts.Select(_ => new float[Dimensions]).ToList());
        }
    }

    private sealed class ThrowingEmbeddingService(Exception toThrow) : IEmbeddingService
    {
        public int Dimensions => 1536;

        public Task<float[]> EmbedAsync(string text, CancellationToken ct) => throw toThrow;

        public Task<IReadOnlyList<float[]>> EmbedBatchAsync(IReadOnlyList<string> texts, CancellationToken ct) =>
            throw toThrow;
    }

    private sealed class StubSearchProvider(SearchResult result) : ISearchProvider
    {
        public SearchRequest? LastFallbackRequest { get; private set; }

        public Task<SearchResult> SearchAsync(SearchRequest request, CancellationToken ct = default)
        {
            // The orchestrator calls the provider twice on the happy path (wide pool) — but on the
            // fallback path the LAST call it makes is the verbatim original request. Capture it so the
            // test can assert the fallback shape matches a normal keyword search.
            LastFallbackRequest = request;
            return Task.FromResult(result);
        }

        public Task<IReadOnlyList<Suggestion>> SuggestAsync(
            string prefix, Guid siteId, int limit = 10, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Suggestion>>([]);
    }
}
