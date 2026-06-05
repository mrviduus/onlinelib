using Domain.LLM;

namespace TextStack.Vocabulary;

public sealed class DistractorGenerator : IDistractorGenerator
{
    private readonly ILlmServiceFactory _llmFactory;

    public DistractorGenerator(ILlmServiceFactory llmFactory)
    {
        _llmFactory = llmFactory;
    }

    public async Task<(List<string>? Distractors, string? Hint, string? Explanation)> GenerateAsync(
        string word, string language, string? definition, string? sentence,
        string nativeLanguage, CancellationToken ct)
    {
        var (systemPrompt, userPrompt) = DistractorPrompt.Build(word, language, definition, sentence, nativeLanguage);

        var llm = _llmFactory.Get("Distractor");
        var text = await llm.CompleteAsync(systemPrompt, userPrompt, maxOutputTokens: 600, ct);

        if (string.IsNullOrWhiteSpace(text))
            return (null, null, null);

        return ParseStructuredResponse(text, word);
    }

    private static (List<string>? Distractors, string? Hint, string? Explanation) ParseStructuredResponse(string raw, string originalWord)
    {
        var lines = raw.Split('\n', StringSplitOptions.TrimEntries);
        string? distractorLine = null;
        string? hintLine = null;
        string? explanationLine = null;

        foreach (var line in lines)
        {
            if (line.StartsWith("DISTRACTORS:", StringComparison.OrdinalIgnoreCase))
                distractorLine = line["DISTRACTORS:".Length..].Trim();
            else if (line.StartsWith("HINT:", StringComparison.OrdinalIgnoreCase))
                hintLine = line["HINT:".Length..].Trim();
            else if (line.StartsWith("EXPLANATION:", StringComparison.OrdinalIgnoreCase))
                explanationLine = line["EXPLANATION:".Length..].Trim();
        }

        var distractors = distractorLine != null
            ? ParseWordList(distractorLine, originalWord)
            : ParseWordList(raw.Replace("\n", ","), originalWord);

        string? hint = null;
        if (!string.IsNullOrWhiteSpace(hintLine)
            && hintLine.Length < 500
            && !hintLine.Contains(originalWord, StringComparison.OrdinalIgnoreCase))
        {
            hint = hintLine;
        }

        string? explanation = null;
        if (!string.IsNullOrWhiteSpace(explanationLine) && explanationLine.Length < 1000)
            explanation = explanationLine;

        return (distractors, hint, explanation);
    }

    private static List<string>? ParseWordList(string raw, string originalWord)
    {
        var words = raw
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(w => w.TrimStart('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '-', ' ').Trim())
            .Where(w => w.Length > 1
                && w.Length < 50
                && w.Any(char.IsLetter)
                && !w.Equals(originalWord, StringComparison.OrdinalIgnoreCase)
                && !w.Contains(' '))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(5)
            .Select(w => w.ToLowerInvariant())
            .ToList();

        return words.Count >= 3 ? words : null;
    }
}
