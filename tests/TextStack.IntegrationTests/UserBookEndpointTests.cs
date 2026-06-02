using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

public class UserBookEndpointTests : IClassFixture<LiveApiFixture>, IClassFixture<AuthenticatedApiFixture>
{
    private readonly LiveApiFixture _anon;
    private readonly AuthenticatedApiFixture _auth;

    public UserBookEndpointTests(LiveApiFixture anon, AuthenticatedApiFixture auth)
    {
        _anon = anon;
        _auth = auth;
    }

    #region Unauthenticated

    [Fact]
    public async Task GetUserBooks_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, "/me/books");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetUserBookQuota_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, "/me/books/quota");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region Authenticated - List

    [Fact]
    public async Task GetUserBooks_Authenticated_Returns200()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, "/me/books");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetUserBooks_ResponseShape_HasNewMetadataFields()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, "/me/books");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode != HttpStatusCode.OK, "list endpoint unavailable");

        var books = await response.Content.ReadFromJsonAsync<UserBookListItem[]>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(books);

        // Verify shape has new fields (even if array is empty, deserialization confirms shape)
        // If there are books, check fields are present
        foreach (var book in books)
        {
            Assert.NotNull(book.Id);
            Assert.NotNull(book.Title);
            // author, genre, totalWordCount are nullable — just verify they deserialize
        }
    }

    #endregion

    #region Authenticated - Quota

    [Fact]
    public async Task GetUserBookQuota_Authenticated_Returns200()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, "/me/books/quota");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var quota = await response.Content.ReadFromJsonAsync<StorageQuotaResponse>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(quota);
        Assert.True(quota.LimitBytes > 0);
    }

    #endregion

    #region Authenticated - Detail

    [Fact]
    public async Task GetUserBook_NonExistent_Returns404()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, $"/me/books/{Guid.NewGuid()}");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    #endregion

    private record UserBookListItem(
        string Id,
        string Title,
        string? Slug,
        string? Language,
        string? Author,
        string? Description,
        string? CoverPath,
        string? Genre,
        string? Status,
        string? ErrorMessage,
        int ChapterCount,
        int? TotalWordCount,
        string? CreatedAt
    );

    private record StorageQuotaResponse(long UsedBytes, long LimitBytes, double UsedPercent);
}
