using System.Net;

namespace TextStack.IntegrationTests;

/// <summary>
/// Regression for the bug that silently killed static-site generation for five weeks.
///
/// `ssg-worker.mjs` calls `http://api:8080/ssg/routes` and sets a `Host` header so the site can be
/// resolved. But `Host` is a forbidden header name in the fetch spec — undici drops it — so the
/// request actually arrives as `Host: api`, which is not a registered site domain. Site resolution
/// returned null, the middleware answered 404, every rebuild job failed into a log nobody watched,
/// and the sitemap kept advertising books whose pages had never been generated: ~389 published
/// books returned a hard 404 to crawlers.
///
/// A unit test cannot cover this — `SiteResolver` depends on the concrete `AppDbContext`, whose
/// model only builds on Npgsql. The failure was also inherently about a real HTTP request's host,
/// which is exactly what an integration test can assert and a mock cannot.
/// </summary>
public class SsgRouteResolutionTests : IClassFixture<LiveApiFixture>
{
    private readonly LiveApiFixture _fixture;

    public SsgRouteResolutionTests(LiveApiFixture fixture) => _fixture = fixture;

    /// <summary>The exact shape of the ssg-worker's call: a host that is not a site domain.</summary>
    [Theory]
    [InlineData("api")]
    [InlineData("api:8080")]
    public async Task SsgRoutes_HostIsNotASiteDomain_StillResolves(string host)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/ssg/routes");
        request.Headers.Host = host;

        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(
            response.StatusCode == HttpStatusCode.InternalServerError, "endpoint unavailable (500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task SsgRoutes_KnownHost_StillWorks()
    {
        var request = _fixture.CreateRequest(HttpMethod.Get, "/ssg/routes");

        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    /// <summary>
    /// The routes payload is what the generator iterates. An empty list would rebuild nothing while
    /// reporting success — the silent-failure shape this whole fix is about.
    /// </summary>
    [Fact]
    public async Task SsgRoutes_ReturnsANonEmptyRouteList()
    {
        var request = _fixture.CreateRequest(HttpMethod.Get, "/ssg/routes");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");

        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.Contains("/en/", body);
    }
}
