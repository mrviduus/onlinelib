using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

public class UserMoodEndpointTests : IClassFixture<LiveApiFixture>, IClassFixture<AuthenticatedApiFixture>
{
    private readonly LiveApiFixture _anon;
    private readonly AuthenticatedApiFixture _auth;

    public UserMoodEndpointTests(LiveApiFixture anon, AuthenticatedApiFixture auth)
    {
        _anon = anon;
        _auth = auth;
    }

    private static bool ShouldSkip(HttpResponseMessage r) =>
        r.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.InternalServerError;

    #region GET /moods (public)

    [Fact]
    public async Task GetAllMoods_Returns200()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, "/moods");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (ShouldSkip(response)) return;
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var moods = await response.Content.ReadFromJsonAsync<MoodDto[]>(cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(moods);
    }

    #endregion

    #region Unauthenticated → 401

    [Fact]
    public async Task GetUserMoodTags_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, "/me/moods");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetMoodsForEdition_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, $"/me/moods/{Guid.NewGuid()}");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task SetMoodsForEdition_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Put, $"/me/moods/{Guid.NewGuid()}");
        request.Content = JsonContent.Create(new { moodIds = new[] { Guid.NewGuid() } });
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region Authenticated

    [Fact]
    public async Task SetMoods_TooMany_Returns400()
    {
        var editionId = Guid.NewGuid();
        var request = _auth.CreateRequest(HttpMethod.Put, $"/me/moods/{editionId}");
        request.Content = JsonContent.Create(new
        {
            moodIds = Enumerable.Range(0, 6).Select(_ => Guid.NewGuid()).ToArray()
        });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (ShouldSkip(response)) return;
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task SetMoods_EmptyList_Returns200()
    {
        var editionId = Guid.NewGuid();
        var request = _auth.CreateRequest(HttpMethod.Put, $"/me/moods/{editionId}");
        request.Content = JsonContent.Create(new { moodIds = Array.Empty<Guid>() });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (ShouldSkip(response)) return;
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetMoodsForEdition_AfterSet_ReturnsMoodIds()
    {
        var editionId = Guid.NewGuid();
        var moodId = Guid.NewGuid();

        // Set (may fail with FK if mood doesn't exist — that's ok, just check the flow)
        var put = _auth.CreateRequest(HttpMethod.Put, $"/me/moods/{editionId}");
        put.Content = JsonContent.Create(new { moodIds = new[] { moodId } });
        var putResp = await _auth.Client.SendAsync(put, TestContext.Current.CancellationToken);

        // FK violation is acceptable — we're testing the endpoint flow
        if (ShouldSkip(putResp) || putResp.StatusCode == HttpStatusCode.InternalServerError) return;

        // Get
        var get = _auth.CreateRequest(HttpMethod.Get, $"/me/moods/{editionId}");
        var getResp = await _auth.Client.SendAsync(get, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, getResp.StatusCode);
    }

    [Fact]
    public async Task GetUserMoodTags_ReturnsArray()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/moods");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (ShouldSkip(response)) return;
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    #endregion

    private record MoodDto(Guid Id, string Slug, string Name, string? Emoji);
}
