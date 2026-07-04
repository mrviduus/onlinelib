using Contracts.Admin;
using TextStack.Ai.Core;

namespace Api.Endpoints;

public static partial class AdminAiQualityEndpoints
{
    // Phase 12 (RLOps slice 4): per-feature daily budget status. Display reads the live in-memory
    // ISpendTracker (NOT the sampled traces — those undercount). The feature set = every explicitly
    // budgeted feature UNION every feature with a configured route (Ai:Routes), so the tab shows
    // routed features even before they have a budget. Budgets are OFF by default → all rows show
    // mode "off", $0 budget, 0% used.
    private static IResult GetBudgets(
        ISpendTracker tracker,
        TextStack.Ai.Llm.BudgetOptions budgets,
        IConfiguration config)
    {
        var features = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var f in budgets.ConfiguredFeatures)
            features.Add(f);
        foreach (var route in config.GetSection("Ai:Routes").GetChildren())
            features.Add(route.Key);

        var rows = features.Select(f =>
        {
            var dailyBudget = budgets.DailyUsdFor(f);
            var mode = budgets.ModeFor(f);
            // Only read the tracker (which lazily seeds a DB sum) for features actually under a
            // budget — a read-only display endpoint must not seed/touch buckets for every routed
            // feature on each page load (QA P2). Unbudgeted features report $0/off without a hit.
            var enforced = mode != TextStack.Ai.Llm.BudgetMode.Off && dailyBudget is { } d && d > 0m;
            var spend = enforced ? tracker.SpentTodayUsd(f) : 0m;
            var pctUsed = dailyBudget is { } b && b > 0m ? (double)(spend / b) : 0d;
            var inFallback = mode == TextStack.Ai.Llm.BudgetMode.Fallback
                && dailyBudget is { } db && spend >= db;

            return new BudgetStatusDto(
                FeatureTag: f,
                TodaySpendUsd: spend,
                DailyBudgetUsd: dailyBudget,
                PctUsed: pctUsed,
                Mode: mode.ToString().ToLowerInvariant(),
                FallbackKey: budgets.FallbackKeyFor(f),
                InFallback: inFallback);
        }).ToList();

        return Results.Ok((IReadOnlyList<BudgetStatusDto>)rows);
    }
}
