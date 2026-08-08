using System.Net;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using TextStack.Ai.Core;
using TextStack.Ai.Llm;
using TextStack.UnitTests.Fakes;

namespace TextStack.UnitTests;

/// <summary>
/// The detection seam. It has to live inside the client because the client SWALLOWS transport
/// failures and returns an empty response — a decorator would see "success with empty text" and
/// could not tell a dead Ollama from a model that legitimately said nothing.
/// </summary>
public class OllamaCircuitBreakerTests
{
    private static readonly DateTimeOffset T0 = new(2026, 8, 8, 12, 0, 0, TimeSpan.Zero);

    private sealed class NoopAlarm : IProviderHealthAlarm
    {
        public void OnCircuitOpened(string p, string? f, string r, TimeSpan retryAfter) { }
        public void OnUnreachableAtStartup(string p, IReadOnlyList<string> tags, string detail) { }
    }

    private static IConfiguration Config() =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Ollama:BaseUrl"] = "http://ollama:11434",
            ["Ollama:Model"] = "gemma4:e2b",
            ["Ollama:TimeoutSeconds"] = "90",
        }).Build();

    private static ProviderHealthRegistry NewHealth() =>
        new(new NoopAlarm(), NullLogger<ProviderHealthRegistry>.Instance);

    private static OllamaLlmClient NewClient(StubHttpMessageHandler handler, IProviderHealth health) =>
        new(handler.AsFactory(), Config(), NullLogger<OllamaLlmClient>.Instance, health);

    private static LlmRequest Request() =>
        new(string.Empty, [new LlmMessage("user", "hi")], 64, FeatureTag: "bookmeta");

    [Fact]
    public async Task CompleteAsync_TransportFailure_OpensCircuit()
    {
        var health = NewHealth();
        var client = NewClient(StubHttpMessageHandler.Transport(), health);

        await client.CompleteAsync(Request(), TestContext.Current.CancellationToken);

        Assert.False(health.IsAvailable(OllamaLlmClient.ProviderKey, DateTimeOffset.UtcNow));
    }

    [Fact]
    public async Task CompleteAsync_Timeout_OpensCircuit()
    {
        var health = NewHealth();
        var client = NewClient(StubHttpMessageHandler.Timeout(), health);

        await client.CompleteAsync(Request(), TestContext.Current.CancellationToken);

        Assert.False(health.IsAvailable(OllamaLlmClient.ProviderKey, DateTimeOffset.UtcNow));
    }

    /// <summary>
    /// A non-2xx means Ollama is ALIVE and answering — typically a wrong `Ollama:Model` → 404.
    /// That fails in milliseconds and one config edit fixes it; hiding it behind 30 minutes of
    /// silence would turn a cheap visible error into an invisible one.
    /// </summary>
    [Fact]
    public async Task CompleteAsync_Non2xx_DoesNotOpenCircuit()
    {
        var health = NewHealth();
        var client = NewClient(StubHttpMessageHandler.Status(HttpStatusCode.NotFound), health);

        await client.CompleteAsync(Request(), TestContext.Current.CancellationToken);

        Assert.True(health.IsAvailable(OllamaLlmClient.ProviderKey, DateTimeOffset.UtcNow));
    }

    /// <summary>The payoff: an open circuit costs zero I/O, not one 90 s timeout per call.</summary>
    [Fact]
    public async Task CompleteAsync_CircuitOpen_MakesNoHttpRequest()
    {
        var health = NewHealth();
        health.ReportFailure(
            OllamaLlmClient.ProviderKey, "bookmeta", LlmFailureAlarm.ReasonTransport, DateTimeOffset.UtcNow);

        var handler = StubHttpMessageHandler.Ok();
        var response = await NewClient(handler, health)
            .CompleteAsync(Request(), TestContext.Current.CancellationToken);

        Assert.Equal(0, handler.RequestCount);
        Assert.Equal(string.Empty, response.Text);
        Assert.Equal(0m, response.Usage.CostUsd);
    }

    [Fact]
    public async Task CompleteAsync_Success_ClosesCircuit()
    {
        var health = NewHealth();
        health.ReportFailure(
            OllamaLlmClient.ProviderKey, "bookmeta", LlmFailureAlarm.ReasonTransport, T0);

        // Advance past the backoff so the probe slot opens, then succeed.
        Assert.True(health.TryBeginCall(OllamaLlmClient.ProviderKey, T0.AddMinutes(1)));
        var client = NewClient(StubHttpMessageHandler.Ok("""{"response":"ok"}"""), health);
        await client.CompleteAsync(Request(), TestContext.Current.CancellationToken);

        Assert.True(health.IsAvailable(OllamaLlmClient.ProviderKey, DateTimeOffset.UtcNow));
    }

    /// <summary>The eval suite constructs this client by hand — the health param must stay optional.</summary>
    [Fact]
    public async Task Ctor_WithoutProviderHealth_StillWorks()
    {
        var client = new OllamaLlmClient(
            StubHttpMessageHandler.Ok("""{"response":"ok"}""").AsFactory(),
            Config(),
            NullLogger<OllamaLlmClient>.Instance);

        var response = await client.CompleteAsync(Request(), TestContext.Current.CancellationToken);

        Assert.Equal("ok", response.Text);
    }
}
