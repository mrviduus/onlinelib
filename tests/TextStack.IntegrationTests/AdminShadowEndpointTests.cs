using System.Net;
using System.Text.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// Integration tests for the admin shadow-comparison + models-registry endpoints (Phase 12 RLOps),
/// against the live API on the admin host (textstack.dev). Mirrors AdminAgentRunsEndpointTests:
/// auth + validation paths assert without seeded rows (an empty shadow_runs table still returns a
/// well-formed empty summary), and the models registry returns the seeded primary routes. Authed
/// assertions need the fixture's test user to be admin; otherwise AdminAuth → 401/403 and the test
/// is skipped rather than false-passing.
///
/// To run: `docker compose up` (API on :8080) with `ENABLE_TEST_AUTH=true`; runs in CI.
/// </summary>
public class AdminShadowEndpointTests : IClassFixture<AuthenticatedApiFixture>
{
    private readonly AuthenticatedApiFixture _fixture;

    public AdminShadowEndpointTests(AuthenticatedApiFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task GetShadowSummary_NoAuth_Unauthorized()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/admin/ai-quality/shadow/summary");
        request.Headers.Host = AuthenticatedApiFixture.AdminHost;

        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode is HttpStatusCode.NotFound, "endpoint not deployed");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetShadowSummary_Authed_NoData_ReturnsEmptyPairs()
    {
        Assert.SkipUnless(_fixture.IsAuthenticated, "auth unavailable");

        // Narrow to a tiny far-past window so the table is empty regardless of real data.
        var request = _fixture.CreateAdminRequest(
            HttpMethod.Get,
            "/admin/ai-quality/shadow/summary?from=2000-01-01T00:00:00Z&to=2000-01-02T00:00:00Z");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint not deployed");
        Assert.SkipWhen(
            response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden,
            "test user is not admin");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(
            await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        var root = doc.RootElement;

        Assert.True(root.TryGetProperty("pairs", out var pairs), "summary has pairs");
        Assert.Equal(JsonValueKind.Array, pairs.ValueKind);
        Assert.Empty(pairs.EnumerateArray());
        Assert.Equal(0, root.GetProperty("totalRuns").GetInt64());
        Assert.True(root.TryGetProperty("from", out _));
        Assert.True(root.TryGetProperty("to", out _));
    }

    [Fact]
    public async Task GetShadowSummary_InvertedWindow_BadRequest()
    {
        Assert.SkipUnless(_fixture.IsAuthenticated, "auth unavailable");

        var request = _fixture.CreateAdminRequest(
            HttpMethod.Get,
            "/admin/ai-quality/shadow/summary?from=2030-01-02T00:00:00Z&to=2030-01-01T00:00:00Z");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint not deployed");
        Assert.SkipWhen(
            response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden,
            "test user is not admin");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task GetShadowSamples_NoAuth_Unauthorized()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/admin/ai-quality/shadow/samples");
        request.Headers.Host = AuthenticatedApiFixture.AdminHost;

        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode is HttpStatusCode.NotFound, "endpoint not deployed");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetShadowSamples_MissingPairParams_BadRequest()
    {
        Assert.SkipUnless(_fixture.IsAuthenticated, "auth unavailable");

        // feature only — primaryModelId + shadowModelId omitted.
        var request = _fixture.CreateAdminRequest(
            HttpMethod.Get, "/admin/ai-quality/shadow/samples?feature=explain");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint not deployed");
        Assert.SkipWhen(
            response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden,
            "test user is not admin");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task GetShadowSamples_AllPairParams_NoData_ReturnsEmptyPage()
    {
        Assert.SkipUnless(_fixture.IsAuthenticated, "auth unavailable");

        var request = _fixture.CreateAdminRequest(
            HttpMethod.Get,
            "/admin/ai-quality/shadow/samples?feature=__none__&primaryModelId=__a__&shadowModelId=__b__");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint not deployed");
        Assert.SkipWhen(
            response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden,
            "test user is not admin");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(
            await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        var root = doc.RootElement;
        Assert.Equal(0, root.GetProperty("total").GetInt64());
        Assert.Empty(root.GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task GetModels_NoAuth_Unauthorized()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/admin/ai-quality/models");
        request.Headers.Host = AuthenticatedApiFixture.AdminHost;

        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode is HttpStatusCode.NotFound, "endpoint not deployed");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetModels_Authed_ReturnsSeededPrimaryRows()
    {
        Assert.SkipUnless(_fixture.IsAuthenticated, "auth unavailable");

        var request = _fixture.CreateAdminRequest(HttpMethod.Get, "/admin/ai-quality/models");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint not deployed");
        Assert.SkipWhen(
            response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden,
            "test user is not admin");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(
            await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        var models = doc.RootElement.GetProperty("models");
        Assert.Equal(JsonValueKind.Array, models.ValueKind);
        // The startup seeder inserts the current PRIMARY routes → at least one row.
        Assert.NotEmpty(models.EnumerateArray());
        foreach (var m in models.EnumerateArray())
        {
            Assert.True(m.TryGetProperty("featureTag", out _));
            Assert.True(m.TryGetProperty("providerKey", out _));
            Assert.True(m.TryGetProperty("modelId", out _));
            Assert.True(m.TryGetProperty("status", out var status));
            Assert.Equal(JsonValueKind.String, status.ValueKind);
        }
    }
}
