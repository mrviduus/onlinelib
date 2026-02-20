using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// Tests for admin mood CRUD endpoints.
/// Admin endpoints require admin auth (textstack.dev host).
/// </summary>
public class AdminMoodEndpointTests : IClassFixture<LiveApiFixture>
{
    private readonly LiveApiFixture _fixture;

    public AdminMoodEndpointTests(LiveApiFixture fixture)
    {
        _fixture = fixture;
    }

    private static bool ShouldSkip(HttpResponseMessage r) =>
        r.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.InternalServerError;

    #region GET /admin/moods

    [Fact]
    public async Task GetAdminMoods_WithoutAdminAuth_Returns401()
    {
        var request = _fixture.CreateAdminRequest(HttpMethod.Get, "/admin/moods");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        // Admin endpoints return 401 without admin auth
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region POST /admin/moods

    [Fact]
    public async Task CreateMood_WithoutAdminAuth_Returns401()
    {
        var request = _fixture.CreateAdminRequest(HttpMethod.Post, "/admin/moods");
        request.Content = JsonContent.Create(new { name = "TestMood", emoji = "🧪" });
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region PUT /admin/moods/{id}

    [Fact]
    public async Task UpdateMood_WithoutAdminAuth_Returns401()
    {
        var request = _fixture.CreateAdminRequest(HttpMethod.Put, $"/admin/moods/{Guid.NewGuid()}");
        request.Content = JsonContent.Create(new { name = "Updated" });
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region DELETE /admin/moods/{id}

    [Fact]
    public async Task DeleteMood_WithoutAdminAuth_Returns401()
    {
        var request = _fixture.CreateAdminRequest(HttpMethod.Delete, $"/admin/moods/{Guid.NewGuid()}");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion
}
