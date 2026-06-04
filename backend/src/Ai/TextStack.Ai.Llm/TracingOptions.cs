namespace TextStack.Ai.Llm;

/// <summary>
/// Trace sampling policy (ADR-AI-011). Errors are always sampled regardless of
/// these rates. <paramref name="PerFeatureRates"/> overrides the default for a
/// given <c>FeatureTag</c> (e.g. high-volume "explain"/"translate" → 0.1).
/// Built from appsettings (<c>Ai:Tracing:Sampling</c>) in AI-005.
/// </summary>
public sealed record TracingOptions(
    double DefaultSampleRate = 1.0,
    IReadOnlyDictionary<string, double>? PerFeatureRates = null)
{
    /// <summary>Effective sample rate (0..1) for a feature tag.</summary>
    public double RateFor(string featureTag) =>
        PerFeatureRates is not null && PerFeatureRates.TryGetValue(featureTag, out var r)
            ? r
            : DefaultSampleRate;
}
