using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// Integration tests for the Study Buddy agent endpoints (AI-037), against the live API. The no-auth /
/// validation / not-found paths run without a key (they're rejected before any agent work); a real
/// streamed run needs a user session + OpenAI key + corpus, so it isn't asserted here.
/// </summary>
public class StudyBuddyEndpointTests : IClassFixture<AuthenticatedApiFixture>
{
    private static readonly Guid SomeEdition = Guid.Parse("11111111-2222-3333-4444-555555555555");
    private readonly AuthenticatedApiFixture _fixture;

    public StudyBuddyEndpointTests(AuthenticatedApiFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Run_NoAuth_Unauthorized()
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/me/books/{SomeEdition}/studybuddy")
        {
            Content = JsonContent.Create(new { passage = "A confusing passage." }),
        };
        request.Headers.Host = LiveApiFixture.TestHost;

        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode is HttpStatusCode.NotFound, "endpoint not deployed");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Run_AuthedEmptyPassage_BadRequest()
    {
        Assert.SkipUnless(_fixture.IsAuthenticated, "auth unavailable");

        var request = _fixture.CreateRequest(HttpMethod.Post, $"/me/books/{SomeEdition}/studybuddy");
        request.Content = JsonContent.Create(new { passage = "" });

        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode is HttpStatusCode.NotFound, "endpoint not deployed");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task GetRun_NoAuth_Unauthorized()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/me/studybuddy/runs/{Guid.NewGuid()}");
        request.Headers.Host = LiveApiFixture.TestHost;

        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode is HttpStatusCode.NotFound, "endpoint not deployed");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetRun_AuthedUnknownRun_NotFound()
    {
        Assert.SkipUnless(_fixture.IsAuthenticated, "auth unavailable");

        var request = _fixture.CreateRequest(HttpMethod.Get, $"/me/studybuddy/runs/{Guid.NewGuid()}");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
