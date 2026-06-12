using System.Text.Json;
using TextStack.Ai.Core;

namespace TextStack.Ai.Tools;

/// <summary>
/// Pure tool-call accuracy scoring for the Phase 5 eval (AI-033). A case passes when the model's
/// round-1 behaviour matches the golden: called the expected tool with the expected argument
/// fragments — or, for a no-tool golden, called nothing. Deterministic, no LLM, unit-tested in CI;
/// the real model runs offline via the admin eval.
/// </summary>
public static class ToolCallMetrics
{
    /// <summary>
    /// True when <paramref name="actual"/> matches the golden expectation.
    /// <paramref name="expectedTool"/> null/empty = the model must call NO tool. Otherwise exactly
    /// that tool must be among the calls (extra parallel calls don't fail the case — the target
    /// behaviour is "did it reach for the right tool"), and for each entry in
    /// <paramref name="expectedArgFragments"/> the named argument must exist and contain the
    /// fragment (case-insensitive substring — args are model-phrased, exact match is brittle).
    /// </summary>
    public static bool IsHit(
        IReadOnlyList<ToolCall> actual,
        string? expectedTool,
        IReadOnlyDictionary<string, string>? expectedArgFragments)
    {
        if (string.IsNullOrEmpty(expectedTool))
            return actual.Count == 0;

        var call = actual.FirstOrDefault(c => c.ToolName == expectedTool);
        if (call is null)
            return false;

        if (expectedArgFragments is null || expectedArgFragments.Count == 0)
            return true;

        foreach (var (arg, fragment) in expectedArgFragments)
        {
            if (call.Arguments.ValueKind != JsonValueKind.Object
                || !call.Arguments.TryGetProperty(arg, out var value))
                return false;

            var text = value.ValueKind switch
            {
                JsonValueKind.String => value.GetString() ?? string.Empty,
                _ => value.GetRawText(),
            };
            if (!text.Contains(fragment, StringComparison.OrdinalIgnoreCase))
                return false;
        }
        return true;
    }

    /// <summary>Accuracy over the golden set: fraction of cases that hit. Empty set → 1.0 (N is reported).</summary>
    public static double Accuracy(IReadOnlyList<bool> hits) =>
        hits.Count == 0 ? 1.0 : (double)hits.Count(h => h) / hits.Count;
}
