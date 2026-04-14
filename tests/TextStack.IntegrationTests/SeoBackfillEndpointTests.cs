using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// Tests for admin SEO Backfill endpoints (auth gating) + internal endpoints (Docker network guard).
/// All admin endpoints require admin auth (textstack.dev host).
/// Internal endpoints check IsLocalRequest — loopback requests pass through to business logic.
/// </summary>
public class SeoBackfillEndpointTests : IClassFixture<LiveApiFixture>
{
    private readonly LiveApiFixture _fixture;

    public SeoBackfillEndpointTests(LiveApiFixture fixture) { _fixture = fixture; }

    // ── Admin auth gating ──

    [Fact]
    public async Task GetCoverage_WithoutAdminAuth_Returns401()
    {
        var req = _fixture.CreateAdminRequest(HttpMethod.Get, "/admin/seo/coverage");
        var res = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task GetGaps_WithoutAdminAuth_Returns401()
    {
        var req = _fixture.CreateAdminRequest(HttpMethod.Get, "/admin/seo/gaps?entityType=Author");
        var res = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task GetSettings_WithoutAdminAuth_Returns401()
    {
        var req = _fixture.CreateAdminRequest(HttpMethod.Get, "/admin/seo/settings");
        var res = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task UpdateSettings_WithoutAdminAuth_Returns401()
    {
        var req = _fixture.CreateAdminRequest(HttpMethod.Put, "/admin/seo/settings");
        req.Content = JsonContent.Create(new { enabled = false, jobsPerRun = 5, intervalSeconds = 60, ssgRebuildBatchMinutes = 5 });
        var res = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task ListTemplates_WithoutAdminAuth_Returns401()
    {
        var req = _fixture.CreateAdminRequest(HttpMethod.Get, "/admin/seo/templates");
        var res = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task GetTemplate_WithoutAdminAuth_Returns401()
    {
        var req = _fixture.CreateAdminRequest(HttpMethod.Get, $"/admin/seo/templates/{Guid.NewGuid()}");
        var res = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task CreateTemplate_WithoutAdminAuth_Returns401()
    {
        var req = _fixture.CreateAdminRequest(HttpMethod.Post, "/admin/seo/templates");
        req.Content = JsonContent.Create(new
        {
            entityType = "Author",
            fieldType = "Bio",
            languageCode = "en",
            name = "test",
            promptTemplate = "x",
            outputSchema = "{}"
        });
        var res = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task UpdateTemplate_WithoutAdminAuth_Returns401()
    {
        var req = _fixture.CreateAdminRequest(HttpMethod.Put, $"/admin/seo/templates/{Guid.NewGuid()}");
        req.Content = JsonContent.Create(new { name = "x", promptTemplate = "x", outputSchema = "{}" });
        var res = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task DeactivateTemplate_WithoutAdminAuth_Returns401()
    {
        var req = _fixture.CreateAdminRequest(HttpMethod.Delete, $"/admin/seo/templates/{Guid.NewGuid()}");
        var res = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task PreviewTemplate_WithoutAdminAuth_Returns401()
    {
        var req = _fixture.CreateAdminRequest(HttpMethod.Post, $"/admin/seo/templates/{Guid.NewGuid()}/preview");
        req.Content = JsonContent.Create(new { entityId = Guid.NewGuid() });
        var res = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task ListJobs_WithoutAdminAuth_Returns401()
    {
        var req = _fixture.CreateAdminRequest(HttpMethod.Get, "/admin/seo/jobs");
        var res = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task GetJob_WithoutAdminAuth_Returns401()
    {
        var req = _fixture.CreateAdminRequest(HttpMethod.Get, $"/admin/seo/jobs/{Guid.NewGuid()}");
        var res = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task ApproveJob_WithoutAdminAuth_Returns401()
    {
        var req = _fixture.CreateAdminRequest(HttpMethod.Post, $"/admin/seo/jobs/{Guid.NewGuid()}/approve");
        var res = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task RevertJob_WithoutAdminAuth_Returns401()
    {
        var req = _fixture.CreateAdminRequest(HttpMethod.Post, $"/admin/seo/jobs/{Guid.NewGuid()}/revert");
        var res = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task RetryJob_WithoutAdminAuth_Returns401()
    {
        var req = _fixture.CreateAdminRequest(HttpMethod.Post, $"/admin/seo/jobs/{Guid.NewGuid()}/retry");
        var res = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task QueueEntity_WithoutAdminAuth_Returns401()
    {
        var req = _fixture.CreateAdminRequest(HttpMethod.Post, "/admin/seo/queue");
        req.Content = JsonContent.Create(new
        {
            entityType = "Author",
            entityId = Guid.NewGuid(),
            fields = new[] { "Bio" },
            language = "en",
            requireReview = true
        });
        var res = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    // ── Internal endpoints — loopback-guarded ──
    // From tests running on host, requests to localhost:8080 hit the loopback check and pass.
    // We verify endpoints respond and handle bad input with BadRequest (not 500).

    [Fact]
    public async Task InternalClaim_LoopbackRequest_Returns200WithClaimedArray()
    {
        var res = await _fixture.Client.PostAsync("/internal/seo/jobs/claim?limit=0", null, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.Contains("claimed", body);
    }

    [Fact]
    public async Task InternalContext_UnknownJobId_ReturnsBadRequest()
    {
        var res = await _fixture.Client.GetAsync($"/internal/seo/jobs/{Guid.NewGuid()}/context", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task InternalApply_UnknownJobId_ReturnsBadRequest()
    {
        var res = await _fixture.Client.PostAsJsonAsync($"/internal/seo/jobs/{Guid.NewGuid()}/apply",
            new { fieldOutputs = new Dictionary<string, string>() }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task InternalFail_UnknownJobId_ReturnsBadRequest()
    {
        var res = await _fixture.Client.PostAsJsonAsync($"/internal/seo/jobs/{Guid.NewGuid()}/fail",
            new { error = "test" }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
}
