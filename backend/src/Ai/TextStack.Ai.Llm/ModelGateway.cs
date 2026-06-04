using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TextStack.Ai.Core;

namespace TextStack.Ai.Llm;

/// <summary>
/// Composite <see cref="ILlmService"/> that routes each call to a provider by
/// <c>FeatureTag</c> (config <c>Ai:Routes:{featureTag}</c> → provider key, falling
/// back to <c>Ai:DefaultProvider</c>). Resolves the *decorated* keyed instance, so
/// tracing already wraps the provider. Callers never know which model answered.
///
/// v0: routing only. Shadow / escalate / cost-cap are later phases.
/// </summary>
public sealed class ModelGateway(
    IServiceProvider serviceProvider,
    IConfiguration config,
    ILogger<ModelGateway> logger) : ILlmService
{
    public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        => Route(request.FeatureTag).CompleteAsync(request, ct);

    public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct)
        => Route(request.FeatureTag).StreamAsync(request, ct);

    private ILlmService Route(string? featureTag)
    {
        string? key = null;
        if (!string.IsNullOrWhiteSpace(featureTag))
        {
            key = config[$"Ai:Routes:{featureTag}"];
            if (key is null)
                logger.LogDebug("No Ai:Routes entry for feature '{Feature}'; using default provider", featureTag);
        }
        key ??= config["Ai:DefaultProvider"] ?? "openai";
        return serviceProvider.GetRequiredKeyedService<ILlmService>(key);
    }
}
