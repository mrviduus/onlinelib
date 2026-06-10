using System.Net;

namespace TextStack.IntegrationTests;

/// <summary>
/// Integration tests for the admin RAG debug endpoint (AI-022), against the live API.
/// Retrieval itself needs an embedded corpus + OpenAI key, so the query path skips when
/// the endpoint is unavailable; the validation path (missing query) runs without a key.
/// </summary>
public class RagEndpointTests : IClassFixture<AuthenticatedApiFixture>
{
    private static readonly Guid SomeEdition = Guid.Parse("11111111-2222-3333-4444-555555555555");
    private readonly AuthenticatedApiFixture _fixture;

    public RagEndpointTests(AuthenticatedApiFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task RagSearch_MissingQuery_Returns400()
    {
        Assert.SkipUnless(_fixture.IsAuthenticated, "admin auth unavailable");

        var request = _fixture.CreateAdminRequest(HttpMethod.Get, $"/admin/rag/{SomeEdition}/search");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode is HttpStatusCode.NotFound, "endpoint not deployed");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task RagSearch_WithQuery_Returns200_WhenAvailable()
    {
        Assert.SkipUnless(_fixture.IsAuthenticated, "admin auth unavailable");

        var request = _fixture.CreateAdminRequest(HttpMethod.Get, $"/admin/rag/{SomeEdition}/search?q=test&k=5");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        // 500 = no OpenAI key / no embedded corpus in this environment → skip rather than fail.
        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (no key/corpus)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
