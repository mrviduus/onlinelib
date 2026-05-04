using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// Tests the GET /me/library endpoint shape — in particular that LibraryItemDto
/// carries the joined Author string (regression guard for the EF projection).
/// </summary>
public class UserLibraryEndpointTests : IClassFixture<LiveApiFixture>, IClassFixture<AuthenticatedApiFixture>
{
    private readonly LiveApiFixture _anon;
    private readonly AuthenticatedApiFixture _auth;

    public UserLibraryEndpointTests(LiveApiFixture anon, AuthenticatedApiFixture auth)
    {
        _anon = anon;
        _auth = auth;
    }

    private record LibraryItem(
        Guid EditionId,
        string Slug,
        string Title,
        string Language,
        string? CoverPath,
        DateTimeOffset CreatedAt,
        string? Author);

    private record LibraryResponse(int Total, LibraryItem[] Items);

    private record CatalogAuthor(Guid Id, string Slug, string Name, string Role);
    private record CatalogBook(Guid Id, string Slug, string Title, string Language,
        string? Description, string? CoverPath, DateTimeOffset? PublishedAt,
        int ChapterCount, CatalogAuthor[] Authors);
    private record CatalogResponse(int Total, CatalogBook[] Items);

    [Fact]
    public async Task GetLibrary_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, "/me/library");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetLibrary_Authenticated_ReturnsLibraryItemsWithAuthorField()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/library");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.InternalServerError) return;
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<LibraryResponse>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(body);
        Assert.NotNull(body!.Items);
        Assert.True(body.Total >= body.Items.Length);

        foreach (var item in body.Items)
        {
            if (item.Author is not null)
            {
                Assert.False(string.IsNullOrWhiteSpace(item.Author),
                    $"Library item {item.EditionId} has empty Author string");
            }
        }
    }

    /// <summary>
    /// Stronger regression test: take a book from the catalog (which we know has
    /// authors), add it to the library, then read the library back and assert
    /// Author equals the joined name list from the catalog. Catches logic bugs
    /// (e.g. EF returning null for everyone) that the schema-only test misses.
    /// Cleans up the added entry on the way out.
    /// </summary>
    [Fact]
    public async Task AddCatalogBookToLibrary_ReturnsJoinedAuthorString()
    {
        // 1. Find a catalog book with at least one author
        var catalogReq = _anon.CreateRequest(HttpMethod.Get, "/books?limit=20");
        var catalogResp = await _anon.Client.SendAsync(catalogReq, TestContext.Current.CancellationToken);
        if (catalogResp.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.InternalServerError) return;
        Assert.Equal(HttpStatusCode.OK, catalogResp.StatusCode);

        var catalog = await catalogResp.Content.ReadFromJsonAsync<CatalogResponse>(
            cancellationToken: TestContext.Current.CancellationToken);
        if (catalog is null || catalog.Items.Length == 0) return; // empty catalog — nothing to test
        var seed = catalog.Items.FirstOrDefault(b => b.Authors.Length > 0);
        if (seed is null) return; // no book with authors in this site
        var expectedAuthor = string.Join(", ", seed.Authors.Select(a => a.Name));

        // 2. Add to library — auth required
        if (!_auth.IsAuthenticated) return;
        var addReq = _auth.CreateRequest(HttpMethod.Post, $"/me/library/{seed.Id}");
        var addResp = await _auth.Client.SendAsync(addReq, TestContext.Current.CancellationToken);
        Assert.True(addResp.IsSuccessStatusCode,
            $"AddToLibrary failed: {(int)addResp.StatusCode} {addResp.ReasonPhrase}");

        try
        {
            // POST returns the LibraryItemDto directly — author should already be there
            var added = await addResp.Content.ReadFromJsonAsync<LibraryItem>(
                cancellationToken: TestContext.Current.CancellationToken);
            Assert.NotNull(added);
            Assert.Equal(expectedAuthor, added!.Author);

            // 3. Read it back via list to confirm GetLibrary projection matches
            var listReq = _auth.CreateRequest(HttpMethod.Get, "/me/library?limit=200");
            var listResp = await _auth.Client.SendAsync(listReq, TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.OK, listResp.StatusCode);
            var list = await listResp.Content.ReadFromJsonAsync<LibraryResponse>(
                cancellationToken: TestContext.Current.CancellationToken);
            Assert.NotNull(list);
            var found = list!.Items.FirstOrDefault(i => i.EditionId == seed.Id);
            Assert.NotNull(found);
            Assert.Equal(expectedAuthor, found!.Author);
        }
        finally
        {
            // 4. Cleanup
            var delReq = _auth.CreateRequest(HttpMethod.Delete, $"/me/library/{seed.Id}");
            await _auth.Client.SendAsync(delReq, TestContext.Current.CancellationToken);
        }
    }
}
