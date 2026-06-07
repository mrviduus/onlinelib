using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace TextStack.Ai.Evals;

/// <summary>
/// Shared LLM-as-judge helpers: the judge system prompt, the strict-JSON verdict
/// parser, and score aggregation. The scoring itself now runs through the
/// Microsoft.Extensions.AI.Evaluation <c>RubricEvaluator</c> (in both the app's
/// <c>EvalSuiteRunner</c> and the eval test suite); these statics are the single
/// source of the prompt + parse so the score is identical wherever it's computed.
/// </summary>
public static class JudgeRunner
{
    /// <summary>The judge's system prompt for a rubric. Shared with the MEAI
    /// <c>RubricEvaluator</c> so both paths score on the identical instruction.</summary>
    public static string BuildSystemPrompt(Rubric rubric) =>
        "You are a strict, fair evaluator of an AI feature's output. " +
        "Score each of three dimensions on an integer scale 1-5 (5 = excellent, 1 = poor):\n" +
        $"- d1 = {rubric.Dim1}\n" +
        $"- d2 = {rubric.Dim2}\n" +
        $"- d3 = {rubric.Dim3}\n" +
        "Return ONLY strict JSON, no markdown, no preface: " +
        "{\"d1\": int, \"d2\": int, \"d3\": int, \"rationale\": \"...\"}";

    public static EvalSummary Aggregate(IReadOnlyCollection<JudgeScore> scores)
    {
        if (scores.Count == 0)
            return new EvalSummary(0, 0, 0, 0, 0);
        var d1 = scores.Average(s => s.D1);
        var d2 = scores.Average(s => s.D2);
        var d3 = scores.Average(s => s.D3);
        return new EvalSummary(scores.Count, d1, d2, d3, (d1 + d2 + d3) / 3.0);
    }

    /// <summary>Parse the judge's strict-JSON verdict. Shared with the MEAI
    /// <c>RubricEvaluator</c> so both paths derive the SAME score from the SAME text.
    /// Unparseable/empty → all-zero (drags the mean down instead of crashing).</summary>
    public static JudgeScore ParseScore(string raw, ILogger? logger = null)
    {
        // Judges occasionally wrap JSON in prose/fences; grab the first {...} span.
        var start = raw.IndexOf('{');
        var end = raw.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            logger?.LogWarning("Judge returned no JSON object: {Raw}", raw);
            return new JudgeScore(0, 0, 0, "unparseable: no JSON object");
        }

        try
        {
            using var doc = JsonDocument.Parse(raw[start..(end + 1)]);
            var root = doc.RootElement;
            return new JudgeScore(
                ReadInt(root, "d1"),
                ReadInt(root, "d2"),
                ReadInt(root, "d3"),
                root.TryGetProperty("rationale", out var r) ? r.GetString() ?? "" : "");
        }
        catch (JsonException ex)
        {
            logger?.LogWarning(ex, "Judge JSON parse failed: {Raw}", raw);
            return new JudgeScore(0, 0, 0, "unparseable: " + ex.Message);
        }
    }

    private static int ReadInt(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var el))
            return 0;
        return el.ValueKind switch
        {
            JsonValueKind.Number when el.TryGetInt32(out var n) => n,
            JsonValueKind.String when int.TryParse(el.GetString(), out var n) => n,
            _ => 0,
        };
    }
}
