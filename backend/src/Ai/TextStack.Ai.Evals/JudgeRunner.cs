using System.Text.Json;
using Microsoft.Extensions.Logging;
using TextStack.Ai.Core;

namespace TextStack.Ai.Evals;

/// <summary>
/// LLM-as-judge. Sends a rubric + (expected, actual) to a judge model via the same
/// <see cref="ILlmService"/> seam (so it routes/traces like any other call — judge
/// runs carry FeatureTag <c>eval.judge</c>) and parses a strict-JSON verdict.
///
/// Per AI-006 the judge is OpenAI through the gateway; swapping to Claude later is a
/// config/provider change, not a code change here. The Explain rubric lives in
/// <see cref="BuildExplainJudgePrompt"/>; AI-007 generalises this per feature.
/// </summary>
public sealed class JudgeRunner(ILlmService judge, ILogger<JudgeRunner>? logger = null)
{
    private const string JudgeSystemPrompt =
        "You are a strict, fair evaluator of an AI feature's output. " +
        "Score each dimension on an integer scale 1-5 (5 = excellent, 1 = poor). " +
        "Return ONLY strict JSON, no markdown, no preface: " +
        "{\"accuracy\": int, \"conciseness\": int, \"usefulness\": int, \"rationale\": \"...\"}";

    public async Task<JudgeScore> JudgeAsync(string judgePrompt, CancellationToken ct)
    {
        var request = new LlmRequest(
            SystemPrompt: JudgeSystemPrompt,
            Messages: [new LlmMessage("user", judgePrompt)],
            MaxOutputTokens: 300,
            FeatureTag: "eval.judge");

        var response = await judge.CompleteAsync(request, ct);
        return Parse(response.Text);
    }

    /// <summary>
    /// Explain rubric (playbook Phase 2). The judge sees the word, its sentence,
    /// a reference explanation and the model's actual explanation.
    /// </summary>
    public static string BuildExplainJudgePrompt(string word, string sentence, string expected, string actual) =>
        "Evaluate a contextual word-explanation feature for a deep-reading app aimed at " +
        "developers reading dense technical books in a second language.\n" +
        "Score 1-5 across:\n" +
        "- accuracy: does it match the meaning the word carries IN THIS SENTENCE's domain?\n" +
        "- conciseness: 2-3 sentences, no padding, no dictionary boilerplate?\n" +
        "- usefulness: would a developer learning the topic find it genuinely helpful?\n\n" +
        $"Word: {word}\n" +
        $"Sentence: {sentence}\n" +
        $"Reference explanation: {expected}\n" +
        $"Actual explanation: {actual}";

    public static EvalSummary Aggregate(IReadOnlyCollection<JudgeScore> scores)
    {
        if (scores.Count == 0)
            return new EvalSummary(0, 0, 0, 0, 0);
        var acc = scores.Average(s => s.Accuracy);
        var con = scores.Average(s => s.Conciseness);
        var use = scores.Average(s => s.Usefulness);
        return new EvalSummary(scores.Count, acc, con, use, (acc + con + use) / 3.0);
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
                ReadInt(root, "accuracy"),
                ReadInt(root, "conciseness"),
                ReadInt(root, "usefulness"),
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
