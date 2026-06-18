namespace TextStack.Ai.Core;

/// <summary>
/// Thrown by the ModelGateway when a feature is over its per-feature daily budget AND its
/// budget mode is <c>hardstop</c> (Phase 12 RLOps). The API's ExceptionMiddleware maps this
/// to HTTP 429 (Too Many Requests). In <c>fallback</c> mode the gateway silently reroutes to
/// the cheaper fallback provider instead of throwing; this type is hardstop-only.
/// </summary>
public sealed class BudgetExceededException : Exception
{
    public string FeatureTag { get; }
    public decimal DailyBudgetUsd { get; }
    public decimal SpentTodayUsd { get; }

    public BudgetExceededException(string featureTag, decimal dailyBudgetUsd, decimal spentTodayUsd)
        : base($"Daily budget exceeded for feature '{featureTag}': spent ${spentTodayUsd} of ${dailyBudgetUsd}.")
    {
        FeatureTag = featureTag;
        DailyBudgetUsd = dailyBudgetUsd;
        SpentTodayUsd = spentTodayUsd;
    }
}
