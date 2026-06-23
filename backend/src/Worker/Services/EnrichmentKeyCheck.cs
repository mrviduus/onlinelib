using Application.Agents;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Worker.Services;

/// <summary>
/// Startup observability for the Enrichment agent (AI-Agent-1, FIX 2). A keyless host is a SILENT dead
/// feature: with no <c>OpenAI:ApiKey</c> the agent throws on its first model call and degrades to Ollama
/// for EVERY book — correct behavior, but invisible (each book burns a DI scope + a Failed agent_run).
/// This check logs ONE clear warning at startup when the <c>bookmeta.agent</c> route resolves to an
/// OpenAI-backed provider while no key is configured, so the degradation is visible. It never changes the
/// safe fallback — it only surfaces it. The Failed/budget_exhausted <c>agent_run</c> rows (agent =
/// <c>enrichment</c>) remain the filterable per-book audit trail in the admin AI-quality surface.
/// </summary>
public sealed class EnrichmentKeyCheck(
    IConfiguration config,
    ILogger<EnrichmentKeyCheck> logger) : IHostedService
{
    // Provider keys backed by OpenAiLlmClient (need OpenAI:ApiKey). Mirrors Application.DependencyInjection.
    private static readonly HashSet<string> OpenAiProviderKeys =
        new(["openai", "openai-explain", "openai-rag", "openai-judge"], StringComparer.Ordinal);

    public Task StartAsync(CancellationToken cancellationToken)
    {
        // Mirror ModelGateway's config precedence (the registry route isn't available at startup):
        // Ai:Routes:bookmeta.agent → Ai:DefaultProvider → "openai".
        var routeKey =
            config[$"Ai:Routes:{EnrichmentAgent.FeatureTag}"]
            ?? config["Ai:DefaultProvider"]
            ?? "openai";

        if (!OpenAiProviderKeys.Contains(routeKey))
            return Task.CompletedTask; // routed to Ollama (or another non-OpenAI provider) → no key needed.

        var hasKey = !string.IsNullOrWhiteSpace(config["OpenAI:ApiKey"])
            || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("OPENAI_API_KEY"));
        if (hasKey)
            return Task.CompletedTask;

        logger.LogWarning(
            "Enrichment agent has no OpenAI key — '{Feature}' routes to OpenAI provider '{Provider}' but " +
            "OpenAI:ApiKey/OPENAI_API_KEY is unset; falling back to Ollama for all book metadata. " +
            "Each book will persist a Failed agent_run (agent='{Agent}'). Set the key to enable the agent.",
            EnrichmentAgent.FeatureTag, routeKey, EnrichmentAgent.AgentName);

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
