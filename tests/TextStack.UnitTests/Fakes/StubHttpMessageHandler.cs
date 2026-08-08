using System.Net;

namespace TextStack.UnitTests.Fakes;

/// <summary>
/// Canned HTTP responses for probe/client tests. The unit-test project had no HTTP double before
/// the provider-readiness work; this is the minimum that covers "reachable", "answering with an
/// error", and the two transport failures the circuit breaker cares about.
///
/// <see cref="RequestCount"/> is what makes "did NOT call" assertable — the central claim of the
/// breaker is that an open circuit performs zero I/O.
/// </summary>
public sealed class StubHttpMessageHandler : HttpMessageHandler
{
    private readonly Func<HttpRequestMessage, HttpResponseMessage> _respond;

    private StubHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) =>
        _respond = respond;

    public int RequestCount { get; private set; }

    public static StubHttpMessageHandler Ok(string json = "{}") =>
        new(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json) });

    public static StubHttpMessageHandler Status(HttpStatusCode code) =>
        new(_ => new HttpResponseMessage(code));

    /// <summary>DNS failure / connection refused — what an absent container looks like.</summary>
    public static StubHttpMessageHandler Transport(string message = "Name or service not known") =>
        new(_ => throw new HttpRequestException(message));

    public static StubHttpMessageHandler Timeout() =>
        new(_ => throw new TaskCanceledException("timed out"));

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        RequestCount++;
        return Task.FromResult(_respond(request));
    }

    public IHttpClientFactory AsFactory() => new SingleHandlerFactory(this);

    private sealed class SingleHandlerFactory(StubHttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) =>
            new(handler, disposeHandler: false) { BaseAddress = null };
    }
}

/// <summary>Throws on CreateClient — the HTTP analogue of `ExplodingScopeFactory`, proving a
/// disabled code path performs no I/O at all rather than merely ignoring the result.</summary>
public sealed class ExplodingHttpClientFactory : IHttpClientFactory
{
    public HttpClient CreateClient(string name) =>
        throw new InvalidOperationException("HTTP must not be used on this path");
}
