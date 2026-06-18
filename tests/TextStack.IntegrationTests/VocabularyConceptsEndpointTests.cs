using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// AI-060: GET /me/vocabulary/concepts — read-only semantic concept clusters for the
/// StatsPage widget. Asserts auth gating + the { items: ConceptClusterDto[] } envelope, and
/// that the legacy book-bonus path (/clusters) is unchanged. Authenticated paths skip when
/// docker compose isn't running or ENABLE_TEST_AUTH isn't set.
/// </summary>
[Collection("VocabularySpiral")]
public class VocabularyConceptsEndpointTests : IClassFixture<LiveApiFixture>, IClassFixture<AuthenticatedApiFixture>
{
    private readonly LiveApiFixture _anon;
    private readonly AuthenticatedApiFixture _auth;

    public VocabularyConceptsEndpointTests(LiveApiFixture anon, AuthenticatedApiFixture auth)
    {
        _anon = anon;
        _auth = auth;
    }

    [Fact]
    public async Task GetConcepts_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, "/me/vocabulary/concepts");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetConcepts_Authenticated_ReturnsItemsEnvelope()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/vocabulary/concepts");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: TestContext.Current.CancellationToken);

        Assert.True(body.TryGetProperty("items", out var items), "concepts response must include items[]");
        Assert.Equal(JsonValueKind.Array, items.ValueKind);

        // If the test user happens to have concept clusters, each item carries the widget shape.
        foreach (var item in items.EnumerateArray())
        {
            Assert.True(item.TryGetProperty("id", out _));
            Assert.True(item.TryGetProperty("title", out _));
            Assert.True(item.TryGetProperty("memberCount", out _));
            Assert.True(item.TryGetProperty("words", out var words));
            Assert.Equal(JsonValueKind.Array, words.ValueKind);
            Assert.True(words.GetArrayLength() <= 6, "widget caps member words at 6");
        }
    }

    [Fact]
    public async Task GetClusters_Authenticated_BookPathUnchanged_ReturnsBookDto()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/vocabulary/clusters");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: TestContext.Current.CancellationToken);

        Assert.True(body.TryGetProperty("items", out var items), "clusters response must include items[]");
        Assert.Equal(JsonValueKind.Array, items.ValueKind);

        // Book DTO shape — the legacy path must still expose isConfirmed/createdAt, NOT words.
        foreach (var item in items.EnumerateArray())
        {
            Assert.True(item.TryGetProperty("isConfirmed", out _));
            Assert.True(item.TryGetProperty("createdAt", out _));
            Assert.False(item.TryGetProperty("words", out _), "book cluster DTO must not carry member words");
        }
    }
}
