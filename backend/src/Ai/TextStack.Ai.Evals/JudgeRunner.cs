using System.Text.Json;
using Microsoft.Extensions.Logging;
using TextStack.Ai.Core;

namespace TextStack.Ai.Evals;

/// <summary>
/// LLM-as-judge. Given a per-feature <see cref="Rubric"/> and an evidence block
/// (the inputs + reference + actual output), it scores 1–5 on each dimension via
/// the same <see cref="ILlmService"/> seam (judge calls carry FeatureTag
/// <c>eval.judge</c>, so they route/trace like any other call) and parses a
/// strict-JSON verdict.
///
/// The runner is feature-agnostic: callers supply the rubric and build the
/// evidence string (see the per-feature eval tests). Swapping the judge model to
/// Claude later is a config/provider change, not a change here.
/// </summary>
public sealed class JudgeRunner(ILlmService judge, ILogger<JudgeRunner>? logger = null)
{
    public async Task<JudgeScore> JudgeAsync(Rubric rubric, string evidence, CancellationToken ct)
    {
        var system =
            "You are a strict, fair evaluator of an AI feature's output. " +
            "Score each of three dimensions on an integer scale 1-5 (5 = excellent, 1 = poor):\n" +
            $"- d1 = {rubric.Dim1}\n" +
            $"- d2 = {rubric.Dim2}\n" +
            $"- d3 = {rubric.Dim3}\n" +
            "Return ONLY strict JSON, no markdown, no preface: " +
            "{\"d1\": int, \"d2\": int, \"d3\": int, \"rationale\": \"...\"}";

        var request = new LlmRequest(
            SystemPrompt: system,
            Messages: [new LlmMessage("user", evidence)],
            MaxOutputTokens: 300,
            FeatureTag: "eval.judge");

        var response = await judge.CompleteAsync(request, ct);
        return Parse(response.Text);
    }

    public static EvalSummary Aggregate(IReadOnlyCollection<JudgeScore> scores)
    {
        if (scores.Count == 0)
            return new EvalSummary(0, 0, 0, 0, 0);
        var d1 = scores.Average(s => s.D1);
        var d2 = scores.Average(s => s.D2);
        var d3 = scores.Average(s => s.D3);
        return new EvalSummary(scores.Count, d1, d2, d3, (d1 + d2 + d3) / 3.0);
    }

    private JudgeScore Parse(string raw)
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
