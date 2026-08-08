using Infrastructure.Telemetry;
using Microsoft.Extensions.Configuration;

namespace TextStack.UnitTests;

/// <summary>
/// Locks the Sentry no-op contract and the sampling policy.
///
/// The no-op matters more than it looks: local dev, CI and forks run without a DSN, and the whole
/// integration is required to be invisible there. Resolve() returning null is what makes the hosts
/// skip UseSentry/AddSentry entirely instead of initialising the SDK with an empty DSN.
/// </summary>
public class SentryBootstrapTests
{
    private static IConfiguration Config(params (string Key, string? Value)[] pairs) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(pairs.ToDictionary(p => p.Key, p => p.Value))
            .Build();

    [Fact]
    public void Resolve_DsnMissing_ReturnsNull() =>
        Assert.Null(SentryBootstrap.Resolve(Config(), "Production"));

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Resolve_DsnBlank_ReturnsNull(string dsn) =>
        Assert.Null(SentryBootstrap.Resolve(Config(("SENTRY_DSN", dsn)), "Production"));

    [Fact]
    public void Resolve_DsnFromEnvStyleKey_ReturnsSettings()
    {
        var settings = SentryBootstrap.Resolve(Config(("SENTRY_DSN", "https://key@example.ingest.sentry.io/1")), "Production");

        Assert.NotNull(settings);
        Assert.Equal("https://key@example.ingest.sentry.io/1", settings.Dsn);
        // No SENTRY_RELEASE here, so the environment is reported as unverified — see
        // SentryEnvironmentTests for why a release-less "Production" claim is not trusted.
        Assert.Equal(SentryBootstrap.UnverifiedProductionEnvironment, settings.Environment);
    }

    [Fact]
    public void Resolve_DsnFromAppSettingsKey_ReturnsSettings()
    {
        var settings = SentryBootstrap.Resolve(Config(("Sentry:Dsn", "https://key@example.ingest.sentry.io/2")), "Staging");

        Assert.NotNull(settings);
        Assert.Equal("https://key@example.ingest.sentry.io/2", settings.Dsn);
    }

    [Fact]
    public void Resolve_Production_DefaultsToTwentyPercent()
    {
        var settings = SentryBootstrap.Resolve(Config(("SENTRY_DSN", "https://k@e.ingest.sentry.io/1")), "Production");

        Assert.Equal(SentryBootstrap.DefaultProductionTracesSampleRate, settings!.TracesSampleRate);
    }

    [Fact]
    public void Resolve_Development_DefaultsToFullSampling()
    {
        var settings = SentryBootstrap.Resolve(Config(("SENTRY_DSN", "https://k@e.ingest.sentry.io/1")), "Development");

        Assert.Equal(1.0, settings!.TracesSampleRate);
    }

    [Fact]
    public void Resolve_ConfiguredRate_OverridesDefault()
    {
        var settings = SentryBootstrap.Resolve(
            Config(("SENTRY_DSN", "https://k@e.ingest.sentry.io/1"), ("Sentry:TracesSampleRate", "0.5")),
            "Production");

        Assert.Equal(0.5, settings!.TracesSampleRate);
    }

    [Theory]
    [InlineData("5", 1.0)]
    [InlineData("-1", 0.0)]
    public void Resolve_RateOutOfRange_IsClamped(string configured, double expected)
    {
        var settings = SentryBootstrap.Resolve(
            Config(("SENTRY_DSN", "https://k@e.ingest.sentry.io/1"), ("Sentry:TracesSampleRate", configured)),
            "Production");

        Assert.Equal(expected, settings!.TracesSampleRate);
    }

    [Theory]
    [InlineData("GET /health")]
    [InlineData("GET /health/ready")]
    public void SampleRateFor_HealthProbe_IsNeverSampled(string transactionName) =>
        Assert.Equal(0.0, SentryBootstrap.SampleRateFor(transactionName, "http.server", 0.2));

    [Theory]
    [InlineData("ai.agent")]
    [InlineData("rag.index")]
    public void SampleRateFor_AiOperation_IsAlwaysSampled(string operation) =>
        Assert.Equal(1.0, SentryBootstrap.SampleRateFor("agent.run", operation, 0.2));

    [Fact]
    public void SampleRateFor_HttpRequest_UsesBaseRate() =>
        Assert.Equal(0.2, SentryBootstrap.SampleRateFor("GET /books", "http.server", 0.2));
}
