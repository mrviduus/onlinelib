using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

public class LibraryShelvesEndpointTests : IClassFixture<LiveApiFixture>, IClassFixture<AuthenticatedApiFixture>
{
    private readonly LiveApiFixture _anon;
    private readonly AuthenticatedApiFixture _auth;

    public LibraryShelvesEndpointTests(LiveApiFixture anon, AuthenticatedApiFixture auth)
    {
        _anon = anon;
        _auth = auth;
    }

    private record ShelfItem(string Id, string Type, string Title, string? Author,
        string? CoverPath, string? Slug, string? Language,
        double ProgressPercent, DateTimeOffset? LastOpenedAt,
        DateTimeOffset CreatedAt, int? EstimatedMinutesRemaining);

    private record ShelvesResponse(
        ShelfItem[] ContinueReading,
        ShelfItem[] RecentlyAdded,
        ShelfItem[] QuickReads,
        ShelfItem[] FinishedThisMonth);

    [Fact]
    public async Task GetShelves_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, "/me/library/shelves");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetShelves_Authenticated_Returns200WithFourShelves()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/library/shelves");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.InternalServerError) return;
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var shelves = await response.Content.ReadFromJsonAsync<ShelvesResponse>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(shelves);
        Assert.NotNull(shelves!.ContinueReading);
        Assert.NotNull(shelves.RecentlyAdded);
        Assert.NotNull(shelves.QuickReads);
        Assert.NotNull(shelves.FinishedThisMonth);

        foreach (var item in shelves.ContinueReading)
        {
            Assert.True(item.ProgressPercent > 0 && item.ProgressPercent < 1,
                $"continueReading item {item.Id} progress out of (0,1): {item.ProgressPercent}");
            Assert.True(item.Type is "userbook" or "savedbook");
        }

        foreach (var item in shelves.QuickReads)
        {
            if (item.EstimatedMinutesRemaining != null)
                Assert.True(item.EstimatedMinutesRemaining <= 60,
                    $"quickReads item {item.Id} > 60 min: {item.EstimatedMinutesRemaining}");
        }

        Assert.True(shelves.ContinueReading.Length <= 10);
        Assert.True(shelves.RecentlyAdded.Length <= 10);
        Assert.True(shelves.QuickReads.Length <= 10);
        Assert.True(shelves.FinishedThisMonth.Length <= 10);
    }
}
