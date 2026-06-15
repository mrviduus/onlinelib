using System.Text.Json;
using System.Text.Json.Serialization;

namespace Application.Agents;

/// <summary>
/// Parses the critic's JSON verdict into a typed <see cref="CritiqueResult"/> (AI-041). LLMs leak fences and
/// prose around JSON, so we strip code fences and extract the first top-level balanced <c>{...}</c> object via a
/// string-aware brace scan before deserializing leniently. Scores are clamped to [1,5]; a blank severity stays
/// "minor" (absent = not asserted) while a non-empty-but-unrecognized severity coerces to "major" (fail-closed
/// direction — never silently downgrade an unknown severity below the blocker threshold); issues without a fix
/// are dropped. Critically it is FAIL-CLOSED: any failure (empty, no brace, malformed, exception) yields the
/// worst-possible verdict with <c>ParseFailed: true</c>, never an exception and never a silent clean pass — an
/// unparseable critic must read as "reject", so a hallucinating drafter can't sneak past on a critic that
/// merely failed to format its output.
/// </summary>
public static class CriticOutputParser
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
        NumberHandling = JsonNumberHandling.AllowReadingFromString,
    };

    private static readonly CritiqueResult FailClosed = new(
        1, 1, 1, 1,
        [new CritiqueIssue("output", "blocker", "Critic output was unparseable.")],
        ParseFailed: true);

    public static CritiqueResult Parse(string llmText)
    {
        try
        {
            var json = ExtractJson(llmText);
            if (json is null)
                return FailClosed;

            var dto = JsonSerializer.Deserialize<CriticDto>(json, Options);
            if (dto?.Scores is null)
                return FailClosed;

            var issues = (dto.Issues ?? [])
                .Where(i => !string.IsNullOrWhiteSpace(i.Fix))
                .Select(i => new CritiqueIssue(
                    i.Location ?? "draft",
                    NormalizeSeverity(i.Severity),
                    i.Fix!.Trim()))
                .ToList();

            return new CritiqueResult(
                Clamp(dto.Scores.FactualAccuracy),
                Clamp(dto.Scores.Tone),
                Clamp(dto.Scores.Length),
                Clamp(dto.Scores.BannedPhrases),
                issues,
                ParseFailed: false);
        }
        catch
        {
            // Never throw: a critic we cannot read must fail closed, not crash the crew.
            return FailClosed;
        }
    }

    /// <summary>
    /// Strips ```` ``` ```` / ```` ```json ```` fences and returns the first top-level balanced <c>{...}</c>.
    /// A string-aware brace scan from the first <c>{</c>: braces inside JSON string literals are ignored (an
    /// in-string flag toggles on each unescaped <c>"</c>, honoring <c>\</c> so <c>\"</c> doesn't toggle), so the
    /// scan stops at the object's own closing brace. This makes "valid object then arbitrary prose" parse
    /// cleanly and extracts object-0 from <c>[{...},{...}]</c> without splicing across elements. Returns null if
    /// there is no <c>{</c> or the object never balances — caller fail-closes.
    /// </summary>
    private static string? ExtractJson(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return null;

        var cleaned = text.Replace("```json", string.Empty, StringComparison.OrdinalIgnoreCase)
                          .Replace("```", string.Empty);

        var start = cleaned.IndexOf('{');
        if (start < 0)
            return null;

        var depth = 0;
        var inString = false;
        var escaped = false;

        for (var i = start; i < cleaned.Length; i++)
        {
            var c = cleaned[i];

            if (inString)
            {
                if (escaped)
                    escaped = false;
                else if (c == '\\')
                    escaped = true;
                else if (c == '"')
                    inString = false;
                continue;
            }

            switch (c)
            {
                case '"':
                    inString = true;
                    break;
                case '{':
                    depth++;
                    break;
                case '}':
                    depth--;
                    if (depth == 0)
                        return cleaned[start..(i + 1)];
                    break;
            }
        }

        return null; // never balanced → fail closed
    }

    private static int Clamp(int score) => Math.Clamp(score, 1, 5);

    private static string NormalizeSeverity(string? severity)
    {
        var s = severity?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(s))
            return "minor"; // absent = not asserted, don't manufacture severity
        return s is "blocker" or "major" or "minor" ? s : "major"; // unknown-but-stated → fail-closed direction
    }

    private sealed class CriticDto
    {
        [JsonPropertyName("scores")] public ScoresDto? Scores { get; set; }
        [JsonPropertyName("issues")] public List<IssueDto>? Issues { get; set; }
    }

    private sealed class ScoresDto
    {
        [JsonPropertyName("factual_accuracy")] public int FactualAccuracy { get; set; }
        [JsonPropertyName("tone")] public int Tone { get; set; }
        [JsonPropertyName("length")] public int Length { get; set; }
        [JsonPropertyName("banned_phrases")] public int BannedPhrases { get; set; }
    }

    private sealed class IssueDto
    {
        [JsonPropertyName("location")] public string? Location { get; set; }
        [JsonPropertyName("severity")] public string? Severity { get; set; }
        [JsonPropertyName("fix")] public string? Fix { get; set; }
    }
}
