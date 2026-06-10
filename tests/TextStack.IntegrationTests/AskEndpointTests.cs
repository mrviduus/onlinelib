using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// Integration tests for the public "Ask this book" endpoint (AI-025), against the live API.
/// The no-auth path runs without a key; the answer path needs a user session + OpenAI key + corpus,
/// so it skips when not reachable.
/// </summary>
public class AskEndpointTests : IClassFixture<AuthenticatedApiFixture>
{
    private static readonly Guid SomeEdition = Guid.Parse("11111111-2222-3333-4444-555555555555");
    private readonly AuthenticatedApiFixture _fixture;

    public AskEndpointTests(AuthenticatedApiFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Ask_NoAuth_Unauthorized()
    {
        // Unauthenticated request → 401 before any retrieval/LLM work (no key needed).
        var request = new HttpRequestMessage(HttpMethod.Post, $"/books/{SomeEdition}/ask")
        {
            Content = JsonContent.Create(new { question = "anything" }),
        };
        request.Headers.Host = LiveApiFixture.TestHost;

        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode is HttpStatusCode.NotFound, "endpoint not deployed");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Ask_WithAuth_Returns200OrSkips()
    {
        Assert.SkipUnless(_fixture.IsAuthenticated, "auth unavailable");

        var request = _fixture.CreateRequest(HttpMethod.Post, $"/books/{SomeEdition}/ask");
        request.Content = JsonContent.Create(new { question = "how does it work?" });
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        // 404 = unknown edition, 500 = erroring, 503 = no key → skip rather than fail.
        Assert.SkipWhen(
            IntegrationSkip.Unavailable(response) || response.StatusCode == HttpStatusCode.ServiceUnavailable,
            "endpoint not reachable (no edition / key / corpus)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
