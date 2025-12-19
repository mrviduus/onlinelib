using System.Net.Http.Json;

namespace OnlineLib.IntegrationTests;

/// <summary>
/// Integration tests for host-based site resolution.
/// See: docs/05-features/feat-0004-site-resolver-host.md
/// </summary>
public class HostSiteResolutionTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly HttpClient _client;

    public HostSiteResolutionTests(TestWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Theory]
    [InlineData("programming.localhost", "programming")]
    [InlineData("general.localhost", "general")]
    [InlineData("fiction.localhost", "general")] // alias
    [InlineData("unknown.localhost", "general")] // default
    public async Task DebugSite_WithHostHeader_ReturnsResolvedSite(string host, string expectedSite)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/debug/site");
        request.Headers.Host = host;

        var response = await _client.SendAsync(request);

        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<SiteResponse>();
        Assert.Equal(expectedSite, result?.Site);
    }

    [Theory]
    [InlineData("programming", "programming")]
    [InlineData("general", "general")]
    [InlineData("fiction", "general")] // alias
    public async Task DebugSite_WithQueryOverride_ReturnsOverriddenSite(string querySite, string expectedSite)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/debug/site?site={querySite}");
        request.Headers.Host = "unknown.localhost"; // host would resolve to general

        var response = await _client.SendAsync(request);

        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<SiteResponse>();
        Assert.Equal(expectedSite, result?.Site);
    }

    private record SiteResponse(string Site);
}
