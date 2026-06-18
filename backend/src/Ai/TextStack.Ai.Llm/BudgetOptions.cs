namespace TextStack.Ai.Llm;

/// <summary>How the gateway reacts when a feature crosses its daily budget.</summary>
public enum BudgetMode
{
    /// <summary>No enforcement — route as normal even over budget (default).</summary>
    Off,

    /// <summary>Reroute to the configured cheaper fallback provider (silent, no error).</summary>
    Fallback,

    /// <summary>Reject the call with <c>BudgetExceededException</c> → HTTP 429.</summary>
    HardStop,
}

/// <summary>Per-feature budget policy for one feature (daily cap + over-budget behaviour).</summary>
public sealed record FeatureBudget(decimal? DailyUsd, string? Fallback, BudgetMode Mode);

/// <summary>
/// Cost-aware routing policy (Phase 12 RLOps slice 4). For a given <c>FeatureTag</c>,
/// <see cref="Features"/> maps the feature → a daily USD cap + over-budget mode + an optional
/// cheaper fallback provider key. A feature with no entry inherits <see cref="Default"/>'s mode
/// (and has no cap). Budgets are OFF by default (empty <see cref="Features"/> + Default mode Off),
/// so nothing is enforced until a feature is explicitly configured. Built from appsettings
/// (<c>Ai:Budgets</c>). Pure lookups — unit-testable, no DI.
/// </summary>
public sealed record BudgetOptions(
    FeatureBudget Default,
    IReadOnlyDictionary<string, FeatureBudget> Features)
{
    /// <summary>An all-off policy (no features, Default mode Off). The DI-safe empty default.</summary>
    public static BudgetOptions Empty { get; } =
        new(new FeatureBudget(null, null, BudgetMode.Off), new Dictionary<string, FeatureBudget>());

    /// <summary>The explicitly-configured feature tags (those with an <c>Ai:Budgets:Features</c> entry).</summary>
    public IEnumerable<string> ConfiguredFeatures => Features.Keys;

    /// <summary>Daily USD cap for a feature, or null if none is set (cap absent or ≤ 0 → disabled).</summary>
    public decimal? DailyUsdFor(string? featureTag)
    {
        var b = Lookup(featureTag);
        return b.DailyUsd is { } d && d > 0m ? d : null;
    }

    /// <summary>Cheaper fallback provider key for a feature, or null if none is configured.</summary>
    public string? FallbackKeyFor(string? featureTag)
    {
        var key = Lookup(featureTag).Fallback;
        return string.IsNullOrWhiteSpace(key) ? null : key;
    }

    /// <summary>Over-budget mode for a feature; a missing feature inherits <see cref="Default"/>'s mode.</summary>
    public BudgetMode ModeFor(string? featureTag) => Lookup(featureTag).Mode;

    private FeatureBudget Lookup(string? featureTag)
    {
        if (!string.IsNullOrWhiteSpace(featureTag) && Features.TryGetValue(featureTag, out var b))
            return b;
        // Unknown feature → inherit the Default mode, but never a cap/fallback.
        return new FeatureBudget(null, null, Default.Mode);
    }
}
