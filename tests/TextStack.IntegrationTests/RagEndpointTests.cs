using System.Net;

namespace TextStack.IntegrationTests;

/// <summary>
/// Integration tests for the admin RAG debug endpoint (AI-022), against the live API.
/// The shared <see cref="AuthenticatedApiFixture"/> logs in a regular user, not an admin, so
/// admin endpoints return 401 here — tests skip on that (and on no-key/not-deployed) rather
/// than false-fail. They assert real behaviour only when run with an admin session + corpus.
/// </summary>
public class RagEndpointTests : IClassFixture<AuthenticatedApiFixture>
{
    private static readonly Guid SomeEdition = Guid.Parse("11111111-2222-3333-4444-555555555555");
    private readonly AuthenticatedApiFixture _fixture;

    public RagEndpointTests(AuthenticatedApiFixture fixture) => _fixture = fixture;

    // 401/403 = fixture isn't an admin; 404/500 = not deployed/erroring; 503 = no OpenAI key.
    private static bool NotReachable(HttpResponseMessage r) =>
        IntegrationSkip.Unavailable(r)
        || r.StatusCode is HttpStatusCode.Unauthorized
            or HttpStatusCode.Forbidden
            or HttpStatusCode.ServiceUnavailable;

    [Fact]
    public async Task RagSearch_MissingQuery_Returns400()
    {
        Assert.SkipUnless(_fixture.IsAuthenticated, "auth unavailable");

        var request = _fixture.CreateAdminRequest(HttpMethod.Get, $"/admin/rag/{SomeEdition}/search");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(NotReachable(response), "admin endpoint not reachable (no admin session)");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task RagSearch_WithQuery_Returns200_WhenAvailable()
    {
        Assert.SkipUnless(_fixture.IsAuthenticated, "auth unavailable");

        var request = _fixture.CreateAdminRequest(HttpMethod.Get, $"/admin/rag/{SomeEdition}/search?q=test&k=5");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(NotReachable(response), "admin endpoint not reachable (no admin session / key / corpus)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task RagSearch_SpoilerGateZero_ReturnsEmpty()
    {
        Assert.SkipUnless(_fixture.IsAuthenticated, "auth unavailable");

        // maxChapterOrd=0 means "no chapters read" → the gate must return nothing.
        var request = _fixture.CreateAdminRequest(
            HttpMethod.Get, $"/admin/rag/{SomeEdition}/search?q=test&maxChapterOrd=0");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(NotReachable(response), "admin endpoint not reachable (no admin session / key)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.Equal("[]", body.Trim());
    }
}
