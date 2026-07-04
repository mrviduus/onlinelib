using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// Guard for the R1b SSG regression (BUG-1). The SSG worker
/// (apps/web/scripts/ssg-worker.mjs) fetches <c>/ssg/routes</c> with only a Host
/// header — no <c>?site=</c> query param (that dev override was removed in R1b).
/// If SiteContextMiddleware ever stops resolving the site from the Host header for
/// this internal consumer, the request 404s in the middleware before reaching the
/// handler and the SSG job fails silently.
///
/// This reproduces the worker's exact call (Host: localhost, a seeded domain →
/// DefaultSiteId) and asserts 200 + routes. A 404 here == the regression.
///
/// Deliberately does NOT use <c>IntegrationSkip.Unavailable</c>: that skips on 404,
/// which is precisely the failure we must catch. We only skip when the live API is
/// unreachable (not started locally — Postgres/API down).
/// </summary>
public class SsgRoutesEndpointTests : IClassFixture<LiveApiFixture>
{
    private readonly LiveApiFixture _fixture;

    public SsgRoutesEndpointTests(LiveApiFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    public async Task GetSsgRoutes_WithHostHeaderOnly_ResolvesSiteAndReturnsRoutes()
    {
        // LiveApiFixture.TestHost == "localhost" — the same seeded domain the SSG
        // worker resolves against (API_HOST=localhost in docker-compose).
        var request = _fixture.CreateRequest(HttpMethod.Get, "/ssg/routes");

        HttpResponseMessage response;
        try
        {
            response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            Assert.Skip("live API unavailable (start the stack to run this guard)");
            return;
        }

        // NOT 404: a 404 means the middleware failed to resolve the site from the
        // Host header — the exact BUG-1 regression that broke the SSG pipeline.
        Assert.NotEqual(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        // Routes always include the static pages (/en/, /en/books, ...) even on an
        // empty catalog, so a resolved site yields a non-empty list.
        var payload = await response.Content.ReadFromJsonAsync<RoutesResponse>(TestContext.Current.CancellationToken);
        Assert.NotNull(payload);
        Assert.NotEmpty(payload!.Routes);
    }

    private sealed record RoutesResponse(string[] Routes, int Count);
}
