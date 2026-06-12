using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// AI-031a — content negotiation on POST /explain against the live API. Without an
/// <c>Accept: text/event-stream</c> header the original JSON contract must hold (the mobile client
/// depends on it); with it the response must be an SSE stream. LLM-touching outcomes skip when the
/// backing provider isn't available (no key / 5xx), like the other live-API suites.
/// </summary>
public class ExplainSseEndpointTests : IClassFixture<LiveApiFixture>
{
    private readonly LiveApiFixture _fixture;

    public ExplainSseEndpointTests(LiveApiFixture fixture) => _fixture = fixture;

    private static readonly object ValidBody = new
    {
        word = "quorum",
        sentence = "The write succeeds once a quorum of replicas acknowledges it.",
        targetLang = "en",
    };

    private HttpRequestMessage Request(bool sse)
    {
        var request = _fixture.CreateRequest(HttpMethod.Post, "/explain");
        request.Content = JsonContent.Create(ValidBody);
        if (sse)
            request.Headers.Accept.ParseAdd("text/event-stream");
        return request;
    }

    // 429 = rate-limited (explain is throttled); 5xx = no provider/key behind the endpoint.
    private static bool NotReachable(HttpResponseMessage r) =>
        IntegrationSkip.Unavailable(r)
        || r.StatusCode is HttpStatusCode.TooManyRequests
            or HttpStatusCode.BadGateway
            or HttpStatusCode.ServiceUnavailable
            or HttpStatusCode.GatewayTimeout;

    [Fact]
    public async Task Explain_InvalidBody_Returns400_RegardlessOfAccept()
    {
        var request = Request(sse: true);
        request.Content = JsonContent.Create(new { word = "", sentence = "" });

        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "explain endpoint not deployed");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Explain_WithoutSseAccept_KeepsJsonContract()
    {
        var response = await _fixture.Client.SendAsync(Request(sse: false), TestContext.Current.CancellationToken);

        Assert.SkipWhen(NotReachable(response), "explain backend unavailable (no key / throttled)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.False(string.IsNullOrWhiteSpace(doc.RootElement.GetProperty("explanation").GetString()));
    }

    [Fact]
    public async Task Explain_WithSseAccept_StreamsEventStream()
    {
        var response = await _fixture.Client.SendAsync(
            Request(sse: true), HttpCompletionOption.ResponseHeadersRead, TestContext.Current.CancellationToken);

        Assert.SkipWhen(NotReachable(response), "explain backend unavailable (no key / throttled)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);

        // The stream must terminate with done (success) or error (e.g. keyless host) — never hang
        // and never abort mid-stream.
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.True(
            body.Contains("event: done") || body.Contains("event: error"),
            $"SSE stream ended without a terminal event:\n{body}");
        if (body.Contains("event: done"))
            Assert.Contains("event: delta", body); // success implies at least one text delta
    }
}
