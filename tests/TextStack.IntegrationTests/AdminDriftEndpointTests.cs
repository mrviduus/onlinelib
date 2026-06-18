using System.Net;
using System.Text.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// Integration tests for the input-drift endpoint (Phase 12 RLOps slice 5b), against the live API
/// on the admin host. <c>GET /admin/ai-quality/drift</c> returns one point per (feature, day) from
/// <c>drift_centroids</c>, Day-ordered, NEVER exposing the raw centroid vectors. Drift detection is
/// OFF by default, so the regression guarantee is: admin-gated (401 without auth) and a well-formed
/// (possibly empty) array when authed; each present row carries the drift-point shape.
///
/// To run: `docker compose up` (API on :8080) with `ENABLE_TEST_AUTH=true`; runs in CI. The
/// synthetic-regression demo (a stable baseline then off-distribution days → an `alerting` row +
/// one admin email) lives in the UnitTests project (DriftDetectionWorkerFlowTests) since it drives
/// the worker's per-feature method directly with a fake embedder — no live OpenAI / DB seeding here.
/// </summary>
public class AdminDriftEndpointTests : IClassFixture<AuthenticatedApiFixture>
{
    private readonly AuthenticatedApiFixture _fixture;

    public AdminDriftEndpointTests(AuthenticatedApiFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task GetDrift_NoAuth_Unauthorized()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/admin/ai-quality/drift");
        request.Headers.Host = AuthenticatedApiFixture.AdminHost;

        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode is HttpStatusCode.NotFound, "endpoint not deployed");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetDrift_Authed_ReturnsDriftPointArray()
    {
        Assert.SkipUnless(_fixture.IsAuthenticated, "auth unavailable");

        var request = _fixture.CreateAdminRequest(HttpMethod.Get, "/admin/ai-quality/drift");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint not deployed");
        Assert.SkipWhen(
            response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden,
            "test user is not admin");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(
            await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        var root = doc.RootElement;
        // Drift OFF by default → empty array is the expected steady state. Either way it's a
        // well-formed array; every present row carries the drift-point shape (and NO centroid).
        Assert.Equal(JsonValueKind.Array, root.ValueKind);

        foreach (var row in root.EnumerateArray())
        {
            Assert.True(row.TryGetProperty("feature", out var feature));
            Assert.Equal(JsonValueKind.String, feature.ValueKind);
            Assert.True(row.TryGetProperty("day", out _));
            Assert.True(row.TryGetProperty("driftScore", out _)); // may be null
            Assert.True(row.TryGetProperty("sampleSize", out _));
            Assert.True(row.TryGetProperty("alertState", out _));
            // The raw centroid vector must never be exposed.
            Assert.False(row.TryGetProperty("centroid", out _));
        }
    }

    [Fact]
    public async Task GetDrift_FilteredByMissingFeature_ReturnsEmpty()
    {
        Assert.SkipUnless(_fixture.IsAuthenticated, "auth unavailable");

        var request = _fixture.CreateAdminRequest(
            HttpMethod.Get, "/admin/ai-quality/drift?feature=__no_such_feature__&days=7");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint not deployed");
        Assert.SkipWhen(
            response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden,
            "test user is not admin");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(
            await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal(JsonValueKind.Array, doc.RootElement.ValueKind);
        Assert.Equal(0, doc.RootElement.GetArrayLength());
    }
}
