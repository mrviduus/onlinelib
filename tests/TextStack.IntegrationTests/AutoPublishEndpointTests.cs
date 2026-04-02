using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// Tests for admin auto-publish endpoints.
/// All require admin auth (textstack.dev host).
/// </summary>
public class AutoPublishEndpointTests : IClassFixture<LiveApiFixture>
{
    private readonly LiveApiFixture _fixture;

    public AutoPublishEndpointTests(LiveApiFixture fixture)
    {
        _fixture = fixture;
    }

    #region GET /admin/autopublish/settings

    [Fact]
    public async Task GetSettings_WithoutAdminAuth_Returns401()
    {
        var request = _fixture.CreateAdminRequest(HttpMethod.Get, "/admin/autopublish/settings");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region PUT /admin/autopublish/settings

    [Fact]
    public async Task UpdateSettings_WithoutAdminAuth_Returns401()
    {
        var request = _fixture.CreateAdminRequest(HttpMethod.Put, "/admin/autopublish/settings");
        request.Content = JsonContent.Create(new
        {
            enabled = false,
            booksPerDay = 1,
            hourUtc = 10,
            requireReview = false,
            language = ""
        });
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region GET /admin/autopublish/jobs

    [Fact]
    public async Task GetJobs_WithoutAdminAuth_Returns401()
    {
        var request = _fixture.CreateAdminRequest(HttpMethod.Get, "/admin/autopublish/jobs");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region GET /admin/autopublish/jobs/{id}

    [Fact]
    public async Task GetJob_WithoutAdminAuth_Returns401()
    {
        var request = _fixture.CreateAdminRequest(HttpMethod.Get, $"/admin/autopublish/jobs/{Guid.NewGuid()}");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region POST /admin/autopublish/jobs/{id}/approve

    [Fact]
    public async Task ApproveJob_WithoutAdminAuth_Returns401()
    {
        var request = _fixture.CreateAdminRequest(HttpMethod.Post, $"/admin/autopublish/jobs/{Guid.NewGuid()}/approve");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region POST /admin/autopublish/jobs/{id}/reject

    [Fact]
    public async Task RejectJob_WithoutAdminAuth_Returns401()
    {
        var request = _fixture.CreateAdminRequest(HttpMethod.Post, $"/admin/autopublish/jobs/{Guid.NewGuid()}/reject");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region POST /admin/autopublish/jobs/{id}/retry

    [Fact]
    public async Task RetryJob_WithoutAdminAuth_Returns401()
    {
        var request = _fixture.CreateAdminRequest(HttpMethod.Post, $"/admin/autopublish/jobs/{Guid.NewGuid()}/retry");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region POST /admin/autopublish/trigger

    [Fact]
    public async Task Trigger_WithoutAdminAuth_Returns401()
    {
        var request = _fixture.CreateAdminRequest(HttpMethod.Post, "/admin/autopublish/trigger");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region POST /admin/autopublish/queue/{editionId}

    [Fact]
    public async Task QueueEdition_WithoutAdminAuth_Returns401()
    {
        var request = _fixture.CreateAdminRequest(HttpMethod.Post, $"/admin/autopublish/queue/{Guid.NewGuid()}");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region GET /admin/autopublish/candidates

    [Fact]
    public async Task GetCandidates_WithoutAdminAuth_Returns401()
    {
        var request = _fixture.CreateAdminRequest(HttpMethod.Get, "/admin/autopublish/candidates");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion
}
