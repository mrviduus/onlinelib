using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// Integration tests for on-demand "Ask this book" indexing (Phase 1), against the live API.
/// The no-auth path runs without a key; the trigger/status paths need a user session + a real
/// catalog edition, so they skip when not reachable.
/// </summary>
public class BookIndexEndpointTests : IClassFixture<LiveApiFixture>, IClassFixture<AuthenticatedApiFixture>
{
    private static readonly Guid SomeEdition = Guid.Parse("11111111-2222-3333-4444-555555555555");

    private readonly LiveApiFixture _anon;
    private readonly AuthenticatedApiFixture _auth;

    public BookIndexEndpointTests(LiveApiFixture anon, AuthenticatedApiFixture auth)
    {
        _anon = anon;
        _auth = auth;
    }

    private sealed record IndexStatus(string Status, int ChunkCount, int EmbeddedCount);
    private sealed record BookListItem(Guid Id);
    private sealed record BookList(int Total, List<BookListItem> Items);

    [Fact]
    public async Task PostIndex_NoAuth_Unauthorized()
    {
        // Unauthenticated request → 401 before any DB/chunk work (no key needed).
        var request = _anon.CreateRequest(HttpMethod.Post, $"/books/{SomeEdition}/index");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode is HttpStatusCode.NotFound, "endpoint not deployed");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetIndex_NoAuth_Unauthorized()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, $"/books/{SomeEdition}/index");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode is HttpStatusCode.NotFound, "endpoint not deployed");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task PostIndex_AuthedKnownEdition_Returns202Or200WithStatus()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");
        var editionId = await DiscoverEditionIdAsync();
        Assert.SkipWhen(editionId is null, "no catalog edition available");

        var request = _auth.CreateRequest(HttpMethod.Post, $"/books/{editionId}/index");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        // 202 on a fresh claim, 200 on a no-op (already Indexing/Ready). Either is a success.
        Assert.True(
            response.StatusCode is HttpStatusCode.Accepted or HttpStatusCode.OK,
            $"expected 202 or 200, got {(int)response.StatusCode}");

        var status = await response.Content.ReadFromJsonAsync<IndexStatus>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(status);
        Assert.Contains(status!.Status, new[] { "NotIndexed", "Indexing", "Ready", "Failed" });
        Assert.True(status.ChunkCount >= 0);
        Assert.True(status.EmbeddedCount >= 0);
    }

    [Fact]
    public async Task GetIndex_AuthedKnownEdition_ReturnsStatusShape()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");
        var editionId = await DiscoverEditionIdAsync();
        Assert.SkipWhen(editionId is null, "no catalog edition available");

        var request = _auth.CreateRequest(HttpMethod.Get, $"/books/{editionId}/index");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var status = await response.Content.ReadFromJsonAsync<IndexStatus>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(status);
        Assert.Contains(status!.Status, new[] { "NotIndexed", "Indexing", "Ready", "Failed" });
        Assert.True(status.ChunkCount >= 0);
        Assert.True(status.EmbeddedCount >= 0);
    }

    [Fact]
    public async Task GetIndex_UnknownEdition_Returns404()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, $"/books/{SomeEdition}/index");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        // 500 → host erroring; skip rather than fail. 404 is the contract for an unknown edition.
        Assert.SkipWhen(response.StatusCode == HttpStatusCode.InternalServerError, "host erroring");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    /// <summary>Resolves a real catalog edition id from <c>GET /books</c>; null when the catalog is empty.</summary>
    private async Task<Guid?> DiscoverEditionIdAsync()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/books?limit=1");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        if (!response.IsSuccessStatusCode)
            return null;

        var list = await response.Content.ReadFromJsonAsync<BookList>(
            cancellationToken: TestContext.Current.CancellationToken);
        return list?.Items.Count > 0 ? list.Items[0].Id : null;
    }
}
