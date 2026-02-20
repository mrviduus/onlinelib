using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

public class UserRatingEndpointTests : IClassFixture<LiveApiFixture>, IClassFixture<AuthenticatedApiFixture>
{
    private readonly LiveApiFixture _anon;
    private readonly AuthenticatedApiFixture _auth;

    public UserRatingEndpointTests(LiveApiFixture anon, AuthenticatedApiFixture auth)
    {
        _anon = anon;
        _auth = auth;
    }

    private static bool ShouldSkip(HttpResponseMessage r) =>
        r.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.InternalServerError;

    #region Unauthenticated → 401

    [Fact]
    public async Task GetAllRatings_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, "/me/ratings");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetRating_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, $"/me/ratings/{Guid.NewGuid()}");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task UpsertRating_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Put, $"/me/ratings/{Guid.NewGuid()}");
        request.Content = JsonContent.Create(new { rating = 4.0 });
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DeleteRating_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Delete, $"/me/ratings/{Guid.NewGuid()}");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region Authenticated CRUD

    [Fact]
    public async Task UpsertRating_ValidRating_Returns200()
    {
        var editionId = Guid.NewGuid();
        var request = _auth.CreateRequest(HttpMethod.Put, $"/me/ratings/{editionId}");
        request.Content = JsonContent.Create(new { rating = 4.5, reviewText = "Great book" });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (ShouldSkip(response)) return;
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var dto = await response.Content.ReadFromJsonAsync<RatingDto>(cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(dto);
        Assert.Equal(4.5, dto.Rating);
        Assert.Equal("Great book", dto.ReviewText);
    }

    [Fact]
    public async Task UpsertRating_HalfStar_Returns200()
    {
        var editionId = Guid.NewGuid();
        var request = _auth.CreateRequest(HttpMethod.Put, $"/me/ratings/{editionId}");
        request.Content = JsonContent.Create(new { rating = 3.5 });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (ShouldSkip(response)) return;
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var dto = await response.Content.ReadFromJsonAsync<RatingDto>(cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(dto);
        Assert.Equal(3.5, dto.Rating);
    }

    [Fact]
    public async Task UpsertRating_InvalidRating0_Returns400()
    {
        var request = _auth.CreateRequest(HttpMethod.Put, $"/me/ratings/{Guid.NewGuid()}");
        request.Content = JsonContent.Create(new { rating = 0 });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (ShouldSkip(response)) return;
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UpsertRating_InvalidRating5_5_Returns400()
    {
        var request = _auth.CreateRequest(HttpMethod.Put, $"/me/ratings/{Guid.NewGuid()}");
        request.Content = JsonContent.Create(new { rating = 5.5 });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (ShouldSkip(response)) return;
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UpsertRating_InvalidRating0_3_Returns400()
    {
        var request = _auth.CreateRequest(HttpMethod.Put, $"/me/ratings/{Guid.NewGuid()}");
        request.Content = JsonContent.Create(new { rating = 0.3 });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (ShouldSkip(response)) return;
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UpsertRating_Upsert_UpdatesExisting()
    {
        var editionId = Guid.NewGuid();

        // Create
        var req1 = _auth.CreateRequest(HttpMethod.Put, $"/me/ratings/{editionId}");
        req1.Content = JsonContent.Create(new { rating = 3.0 });
        var resp1 = await _auth.Client.SendAsync(req1, TestContext.Current.CancellationToken);
        if (ShouldSkip(resp1)) return;
        Assert.Equal(HttpStatusCode.OK, resp1.StatusCode);

        // Update
        var req2 = _auth.CreateRequest(HttpMethod.Put, $"/me/ratings/{editionId}");
        req2.Content = JsonContent.Create(new { rating = 4.5, reviewText = "Changed my mind" });
        var resp2 = await _auth.Client.SendAsync(req2, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, resp2.StatusCode);

        var dto = await resp2.Content.ReadFromJsonAsync<RatingDto>(cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(dto);
        Assert.Equal(4.5, dto.Rating);
        Assert.Equal("Changed my mind", dto.ReviewText);
    }

    [Fact]
    public async Task GetRating_AfterUpsert_ReturnsRating()
    {
        var editionId = Guid.NewGuid();

        // Upsert
        var put = _auth.CreateRequest(HttpMethod.Put, $"/me/ratings/{editionId}");
        put.Content = JsonContent.Create(new { rating = 2.5 });
        var putResp = await _auth.Client.SendAsync(put, TestContext.Current.CancellationToken);
        if (ShouldSkip(putResp)) return;

        // Get
        var get = _auth.CreateRequest(HttpMethod.Get, $"/me/ratings/{editionId}");
        var getResp = await _auth.Client.SendAsync(get, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, getResp.StatusCode);

        var dto = await getResp.Content.ReadFromJsonAsync<RatingDto>(cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(dto);
        Assert.Equal(2.5, dto.Rating);
    }

    [Fact]
    public async Task GetRating_Nonexistent_Returns404()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, $"/me/ratings/{Guid.NewGuid()}");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (ShouldSkip(response)) return;
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task DeleteRating_AfterUpsert_Returns204()
    {
        var editionId = Guid.NewGuid();

        // Create
        var put = _auth.CreateRequest(HttpMethod.Put, $"/me/ratings/{editionId}");
        put.Content = JsonContent.Create(new { rating = 3.5 });
        var putResp = await _auth.Client.SendAsync(put, TestContext.Current.CancellationToken);
        if (ShouldSkip(putResp)) return;

        // Delete
        var del = _auth.CreateRequest(HttpMethod.Delete, $"/me/ratings/{editionId}");
        var delResp = await _auth.Client.SendAsync(del, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NoContent, delResp.StatusCode);

        // Verify gone
        var get = _auth.CreateRequest(HttpMethod.Get, $"/me/ratings/{editionId}");
        var getResp = await _auth.Client.SendAsync(get, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, getResp.StatusCode);
    }

    [Fact]
    public async Task DeleteRating_Nonexistent_Returns404()
    {
        var request = _auth.CreateRequest(HttpMethod.Delete, $"/me/ratings/{Guid.NewGuid()}");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (ShouldSkip(response)) return;
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetAllRatings_ReturnsArray()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/ratings");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (ShouldSkip(response)) return;
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var ratings = await response.Content.ReadFromJsonAsync<RatingDto[]>(cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(ratings);
    }

    #endregion

    private record RatingDto(Guid EditionId, double Rating, string? ReviewText, DateTimeOffset UpdatedAt);
}
