namespace TextStack.Ai.Llm;

/// <summary>
/// Single source of LLM pricing. Prices are USD per 1,000,000 tokens
/// (input, output). v1 figures — REVIEW before relying on billing accuracy.
///
/// Per ADR-AI-012 the tracing layer owns cost; for AI-002 we surface cost in
/// <c>LlmUsage</c> on the response, so pricing lives here and AI-003's
/// TracingDecorator will consume it via DI. Self-hosted models (Ollama) are
/// free — callers pass cost 0 directly and never hit this table.
/// </summary>
public static class ModelPricing
{
    // (inputPerMillion, outputPerMillion) USD.
    private static readonly IReadOnlyDictionary<string, (decimal Input, decimal Output)> Prices =
        new Dictionary<string, (decimal, decimal)>(StringComparer.OrdinalIgnoreCase)
        {
            ["gpt-4.1-nano"] = (0.10m, 0.40m),
            ["gpt-5-mini"] = (0.25m, 2.00m),
            ["gpt-4o-mini"] = (0.15m, 0.60m),
        };

    /// <summary>True if we have an explicit price for this model id.</summary>
    public static bool IsPriced(string modelId) => Prices.ContainsKey(modelId);

    /// <summary>
    /// Cost in USD for the given token counts. Unknown models cost 0 — the
    /// caller (which has the ILogger) should warn when that's unexpected
    /// (e.g. a paid OpenAI model with no table entry). Ollama models are free.
    /// </summary>
    public static decimal CostUsd(string modelId, int inputTokens, int outputTokens)
    {
        if (!Prices.TryGetValue(modelId, out var p))
            return 0m;
        return inputTokens / 1_000_000m * p.Input + outputTokens / 1_000_000m * p.Output;
    }
}
