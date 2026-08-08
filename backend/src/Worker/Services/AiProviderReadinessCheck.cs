using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TextStack.Ai.Llm;

namespace Worker.Services;

/// <summary>One provider the Worker depends on, and the tasks that break if it is down.</summary>
public readonly record struct ProviderProbeTarget(
    string ProviderKey,
    IReadOnlyList<string> FeatureTags,
    ProviderProbeKind Kind);

/// <summary>
/// Probes every provider the Worker's route table actually references, ONCE, at startup — so
/// "the AI pipeline is quietly doing nothing" is stated on the first log line instead of being
/// inferred later from missing data.
///
/// Replaces the previous <c>EnrichmentKeyCheck</c>, whose job this is a strict superset of: that
/// check validated a single hardcoded feature against a hardcoded provider set which had already
/// drifted (it omitted <c>openai-pdf</c>, the most expensive route in the system).
///
/// Registered FIRST among hosted services so <c>StartAsync</c> completes — and, on failure, seeds
/// the circuit open — before any worker loop begins. Three hard rules:
/// <list type="bullet">
///   <item>It can never crash or block the host. Whole body in try/catch; one 2 s network probe.</item>
///   <item>It never spends money. A paid provider is validated by key presence, never by a call.</item>
///   <item>It never changes routing. It reports, and it opens a breaker. Provider choice stays in config.</item>
/// </list>
/// </summary>
public sealed class AiProviderReadinessCheck(
    IConfiguration config,
    IHttpClientFactory httpFactory,
    IProviderHealth health,
    IProviderHealthAlarm alarm,
    ILogger<AiProviderReadinessCheck> logger) : IHostedService
{
    /// <summary>Pure: the probe plan implied by <c>Ai:Routes</c> + <c>Ai:DefaultProvider</c>.</summary>
    public static IReadOnlyList<ProviderProbeTarget> Plan(IConfiguration config) =>
        AiRouteMap.Build(config)
            .Select(kv => new ProviderProbeTarget(kv.Key, kv.Value, AiRouteMap.ProbeKindFor(kv.Key)))
            .OrderBy(t => t.ProviderKey, StringComparer.Ordinal)
            .ToList();

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            if (!config.GetValue("Ai:ProviderHealth:StartupProbe", true))
                return;

            var timeout = TimeSpan.FromSeconds(
                Math.Max(1, config.GetValue("Ai:ProviderHealth:ProbeTimeoutSeconds", 2)));

            var unreachable = 0;

            foreach (var target in Plan(config))
            {
                switch (target.Kind)
                {
                    case ProviderProbeKind.OllamaHttp:
                        if (!await ProbeOllamaAsync(target, timeout, cancellationToken))
                            unreachable++;
                        break;

                    case ProviderProbeKind.OpenAiKey:
                        if (!HasOpenAiKey())
                        {
                            unreachable++;
                            Report(target, "no OpenAI:ApiKey configured");
                            // Deliberately does NOT seed a circuit: a key cannot appear without a
                            // redeploy, and OpenAI is never breaker-managed (its failures are quota
                            // and 5xx, not reachability).
                        }
                        break;

                    default:
                        logger.LogWarning(
                            "Ai:Routes references unknown provider key '{Provider}' for {Tags} — "
                            + "calls will fall back to the config route at runtime",
                            target.ProviderKey, string.Join(", ", target.FeatureTags));
                        break;
                }
            }

            if (unreachable == 0)
                logger.LogInformation("AI provider readiness: all referenced providers reachable");
        }
        catch (Exception ex)
        {
            // A readiness check must never be the reason the Worker fails to start.
            logger.LogWarning(ex, "AI provider readiness check failed; continuing");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private async Task<bool> ProbeOllamaAsync(
        ProviderProbeTarget target, TimeSpan timeout, CancellationToken ct)
    {
        var baseUrl = config["Ollama:BaseUrl"]
            ?? Environment.GetEnvironmentVariable("OLLAMA_BASE_URL")
            ?? "http://localhost:11434";

        try
        {
            // Same shape as the API's /health/ready probe: cheap, unauthenticated, no generation.
            using var client = httpFactory.CreateClient();
            client.Timeout = timeout;
            var response = await client.GetAsync($"{baseUrl}/api/tags", ct);

            if (response.IsSuccessStatusCode)
            {
                health.ReportSuccess(target.ProviderKey, DateTimeOffset.UtcNow);
                return true;
            }

            Fail(target, $"HTTP {(int)response.StatusCode} from {baseUrl}/api/tags");
            return false;
        }
        catch (Exception ex)
        {
            Fail(target, $"{ex.GetType().Name} contacting {baseUrl}");
            return false;
        }
    }

    /// <summary>Report AND open the circuit, so downstream loops skip without ever making a call.</summary>
    private void Fail(ProviderProbeTarget target, string detail)
    {
        Report(target, detail);
        health.ReportFailure(
            target.ProviderKey, null, LlmFailureAlarm.ReasonTransport, DateTimeOffset.UtcNow);
    }

    private void Report(ProviderProbeTarget target, string detail)
    {
        logger.LogError(
            "AI provider unreachable at startup: {Summary} — {Detail}",
            AiRouteMap.FormatUnreachable(target.ProviderKey, target.FeatureTags, "unreachable"),
            detail);

        alarm.OnUnreachableAtStartup(target.ProviderKey, target.FeatureTags, detail);
    }

    private bool HasOpenAiKey() =>
        !string.IsNullOrWhiteSpace(config["OpenAI:ApiKey"])
        || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("OPENAI_API_KEY"));
}
