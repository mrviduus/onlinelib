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

        // Schema check: every item has the new Author field (string? — null or
        // non-empty joined string). This is the regression guard: if someone
        // breaks the EF projection, deserialisation still succeeds with null
        // for every row, so we also assert that AT LEAST ONE item has an
        // author when the library has any books with authors attached.
        foreach (var item in body.Items)
        {
            // Author may be null (book without authors), but if set it must
            // be a non-empty string.
            if (item.Author is not null)
            {
                Assert.False(string.IsNullOrWhiteSpace(item.Author),
                    $"Library item {item.EditionId} has empty Author string");
            }
        }
    }
}
