namespace TextStack.Ai.Llm;

/// <summary>
/// Shadow-routing policy (AI-075). For a given <c>FeatureTag</c>, <see cref="Routes"/>
/// maps the feature → a shadow provider key (e.g. "openai-explain"); the gateway then
/// resolves that key's <c>-raw</c> (untraced) provider. <see cref="PerFeatureRates"/>
/// overrides <see cref="DefaultSampleRate"/> per feature. Shadow is OFF by default
/// (no Routes entry → no shadow), so it never adds paid background calls until a route
/// is explicitly configured. Built from appsettings (<c>Ai:Shadow</c>).
/// </summary>
public sealed record ShadowOptions(
    double DefaultSampleRate,
    IReadOnlyDictionary<string, string> Routes,
    IReadOnlyDictionary<string, double>? PerFeatureRates,
    int TimeoutSeconds)
{
    /// <summary>Shadow provider key for a feature, or null if no shadow route is configured.</summary>
    public string? ShadowKeyFor(string? featureTag)
    {
        if (string.IsNullOrWhiteSpace(featureTag)) return null;
        return Routes.TryGetValue(featureTag, out var key) && !string.IsNullOrWhiteSpace(key) ? key : null;
    }

    /// <summary>Effective sample rate (0..1) for a feature tag.</summary>
    public double RateFor(string? featureTag) =>
        featureTag is not null && PerFeatureRates is not null && PerFeatureRates.TryGetValue(featureTag, out var r)
            ? r
            : DefaultSampleRate;
}
