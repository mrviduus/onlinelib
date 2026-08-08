using System.Net;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using TextStack.Ai.Llm;
using TextStack.UnitTests.Fakes;
using Worker.Services;

namespace TextStack.UnitTests;

/// <summary>
/// The startup probe. Its whole reason to exist is that "the AI pipeline is quietly doing nothing"
/// should be the first line in the log, not something inferred days later from absent data.
///
/// Three properties are non-negotiable and each has a test: it never crashes the host, it never
/// spends money, and when a provider is down it says so exactly once — naming the tasks that break.
/// </summary>
public class AiProviderReadinessCheckTests
{
    private sealed class RecordingAlarm : IProviderHealthAlarm
    {
        public List<(string Provider, IReadOnlyList<string> Tags, string Detail)> Startup { get; } = [];
        public List<string> Opened { get; } = [];

        public void OnCircuitOpened(string providerKey, string? featureTag, string reason, TimeSpan retryAfter) =>
            Opened.Add(providerKey);

        public void OnUnreachableAtStartup(string providerKey, IReadOnlyList<string> featureTags, string detail) =>
            Startup.Add((providerKey, featureTags, detail));
    }

    private static IConfiguration Config(params (string Key, string? Value)[] extra)
    {
        var settings = new Dictionary<string, string?>
        {
            ["Ai:DefaultProvider"] = "ollama",
            ["Ai:Routes:bookmeta"] = "ollama",
            ["Ai:Routes:distractor"] = "ollama",
            ["Ai:Routes:bookmeta.agent"] = "openai-explain",
            ["Ollama:BaseUrl"] = "http://ollama:11434",
            ["OpenAI:ApiKey"] = "sk-test",
        };
        foreach (var (key, value) in extra)
            settings[key] = value;
        return new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
    }

    private static (AiProviderReadinessCheck Check, RecordingAlarm Alarm, ProviderHealthRegistry Health)
        Build(IConfiguration config, IHttpClientFactory factory)
    {
        var alarm = new RecordingAlarm();
        var health = new ProviderHealthRegistry(alarm, NullLogger<ProviderHealthRegistry>.Instance);
        return (
            new AiProviderReadinessCheck(
                config, factory, health, alarm, NullLogger<AiProviderReadinessCheck>.Instance),
            alarm,
            health);
    }

    [Fact]
    public void Plan_DerivesTargetsFromRoutes()
    {
        var plan = AiProviderReadinessCheck.Plan(Config());

        Assert.Contains(plan, t => t.ProviderKey == "ollama" && t.Kind == ProviderProbeKind.OllamaHttp);
        Assert.Contains(plan, t => t.ProviderKey == "openai-explain" && t.Kind == ProviderProbeKind.OpenAiKey);
    }

    [Fact]
    public async Task StartAsync_ProbeDisabled_PerformsNoIo()
    {
        var (check, alarm, _) = Build(
            Config(("Ai:ProviderHealth:StartupProbe", "false")), new ExplodingHttpClientFactory());

        await check.StartAsync(TestContext.Current.CancellationToken);

        Assert.Empty(alarm.Startup);
    }

    [Fact]
    public async Task StartAsync_OllamaReachable_NoAlarm_CircuitStaysClosed()
    {
        var handler = StubHttpMessageHandler.Ok("""{"models":[]}""");
        var (check, alarm, health) = Build(Config(), handler.AsFactory());

        await check.StartAsync(TestContext.Current.CancellationToken);

        Assert.Empty(alarm.Startup);
        Assert.True(health.IsAvailable("ollama", DateTimeOffset.UtcNow));
        Assert.Equal(1, handler.RequestCount);
    }

    /// <summary>
    /// The core behaviour: one alarm, naming the tasks, and the circuit pre-opened so the workers
    /// that start moments later skip without ever making a call.
    /// </summary>
    [Fact]
    public async Task StartAsync_OllamaUnreachable_AlarmsOnceAndOpensCircuit()
    {
        var (check, alarm, health) = Build(Config(), StubHttpMessageHandler.Transport().AsFactory());

        await check.StartAsync(TestContext.Current.CancellationToken);

        var reported = Assert.Single(alarm.Startup);
        Assert.Equal("ollama", reported.Provider);
        Assert.Contains("bookmeta", reported.Tags);
        Assert.Contains("distractor", reported.Tags);
        Assert.False(health.IsAvailable("ollama", DateTimeOffset.UtcNow));
    }

    [Fact]
    public async Task StartAsync_OllamaAnsweringWithError_IsStillUnreachable()
    {
        var (check, alarm, _) = Build(
            Config(), StubHttpMessageHandler.Status(HttpStatusCode.ServiceUnavailable).AsFactory());

        await check.StartAsync(TestContext.Current.CancellationToken);

        Assert.Single(alarm.Startup);
    }

    /// <summary>A paid provider is validated by key presence — never by spending a token.</summary>
    [Fact]
    public async Task StartAsync_OpenAiRoutedButKeyless_AlarmsWithoutOpeningCircuit()
    {
        var (check, alarm, health) = Build(
            Config(("OpenAI:ApiKey", null)), StubHttpMessageHandler.Ok().AsFactory());

        await check.StartAsync(TestContext.Current.CancellationToken);

        var reported = Assert.Single(alarm.Startup, s => s.Provider == "openai-explain");
        Assert.Contains("bookmeta.agent", reported.Tags);
        Assert.True(health.IsAvailable("openai-explain", DateTimeOffset.UtcNow));
    }

    [Fact]
    public async Task StartAsync_UnknownProviderKey_DoesNotAlarm()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Ai:Routes:explain"] = "anthropic",
        }).Build();
        var (check, alarm, _) = Build(config, new ExplodingHttpClientFactory());

        await check.StartAsync(TestContext.Current.CancellationToken);

        Assert.Empty(alarm.Startup);
    }

    /// <summary>A readiness check must never be the reason the Worker fails to start.</summary>
    [Fact]
    public async Task StartAsync_HttpFactoryThrows_DoesNotPropagate()
    {
        var (check, _, _) = Build(Config(), new ExplodingHttpClientFactory());

        await check.StartAsync(TestContext.Current.CancellationToken);
    }
}
