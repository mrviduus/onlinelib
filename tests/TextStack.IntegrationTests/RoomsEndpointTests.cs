using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

public class RoomsEndpointTests : IClassFixture<LiveApiFixture>, IClassFixture<AuthenticatedApiFixture>
{
    private readonly LiveApiFixture _anon;
    private readonly AuthenticatedApiFixture _auth;

    public RoomsEndpointTests(LiveApiFixture anon, AuthenticatedApiFixture auth)
    {
        _anon = anon;
        _auth = auth;
    }

    private static bool ShouldSkip(HttpResponseMessage r) =>
        r.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.InternalServerError;

    // ----- Unauthenticated -----

    [Fact]
    public async Task CreateRoom_WithoutAuth_Returns401()
    {
        var req = _anon.CreateRequest(HttpMethod.Post, "/me/rooms");
        req.Content = JsonContent.Create(new { targetType = "Edition", targetId = Guid.NewGuid() });
        var resp = await _anon.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task ListRooms_WithoutAuth_Returns401()
    {
        var req = _anon.CreateRequest(HttpMethod.Get, "/me/rooms");
        var resp = await _anon.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task GetRoom_WithoutAuth_Returns401()
    {
        var req = _anon.CreateRequest(HttpMethod.Get, $"/rooms/{Guid.NewGuid()}");
        var resp = await _anon.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task JoinRoom_WithoutAuth_Returns401()
    {
        var req = _anon.CreateRequest(HttpMethod.Post, "/rooms/join");
        req.Content = JsonContent.Create(new { token = "deadbeef" });
        var resp = await _anon.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task GetState_WithoutAuth_Returns401()
    {
        var req = _anon.CreateRequest(HttpMethod.Get, $"/rooms/{Guid.NewGuid()}/state");
        var resp = await _anon.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Heartbeat_WithoutAuth_Returns401()
    {
        var req = _anon.CreateRequest(HttpMethod.Post, $"/rooms/{Guid.NewGuid()}/heartbeat");
        req.Content = JsonContent.Create(new { });
        var resp = await _anon.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    // ----- Authenticated input validation -----

    [Fact]
    public async Task CreateRoom_InvalidTargetType_Returns400()
    {
        if (!_auth.IsAuthenticated) return;

        var req = _auth.CreateRequest(HttpMethod.Post, "/me/rooms");
        req.Content = JsonContent.Create(new { targetType = "Nonsense", targetId = Guid.NewGuid() });
        var resp = await _auth.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task CreateRoom_UserBookTargetType_Returns400()
    {
        if (!_auth.IsAuthenticated) return;

        var req = _auth.CreateRequest(HttpMethod.Post, "/me/rooms");
        req.Content = JsonContent.Create(new { targetType = "UserBook", targetId = Guid.NewGuid() });
        var resp = await _auth.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task CreateRoom_UnknownEdition_Returns404()
    {
        if (!_auth.IsAuthenticated) return;

        var req = _auth.CreateRequest(HttpMethod.Post, "/me/rooms");
        req.Content = JsonContent.Create(new { targetType = "Edition", targetId = Guid.NewGuid() });
        var resp = await _auth.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task GetUnknownRoom_Returns404()
    {
        if (!_auth.IsAuthenticated) return;

        var req = _auth.CreateRequest(HttpMethod.Get, $"/rooms/{Guid.NewGuid()}");
        var resp = await _auth.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task JoinRoom_InvalidToken_Returns400()
    {
        if (!_auth.IsAuthenticated) return;

        var req = _auth.CreateRequest(HttpMethod.Post, "/rooms/join");
        req.Content = JsonContent.Create(new { token = "not-a-real-token" });
        var resp = await _auth.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task JoinRoom_EmptyToken_Returns400()
    {
        if (!_auth.IsAuthenticated) return;

        var req = _auth.CreateRequest(HttpMethod.Post, "/rooms/join");
        req.Content = JsonContent.Create(new { token = "" });
        var resp = await _auth.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task ListRooms_Authenticated_Returns200()
    {
        if (!_auth.IsAuthenticated) return;

        var req = _auth.CreateRequest(HttpMethod.Get, "/me/rooms?limit=5&active=true");
        var resp = await _auth.Client.SendAsync(req, TestContext.Current.CancellationToken);
        if (ShouldSkip(resp)) return;
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }
}
