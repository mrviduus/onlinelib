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
        var (systemPrompt, userPrompt) = BuildPrompt(word, language, definition, sentence, nativeLanguage);

        var llm = _llmFactory.Get("Distractor");
        var text = await llm.CompleteAsync(systemPrompt, userPrompt, maxOutputTokens: 600, ct);

        if (string.IsNullOrWhiteSpace(text))
            return (null, null, null);

        return ParseStructuredResponse(text, word);
    }

    private static (string System, string User) BuildPrompt(
        string word, string language, string? definition, string? sentence, string nativeLanguage)
    {
        var system = "You generate vocabulary quiz data for language learners. " +
                     "Always reply in the EXACT format requested. No preface, no markdown.";

        var parts = new List<string>
        {
            $"Word: \"{word}\"",
        };

        if (!string.IsNullOrWhiteSpace(definition))
            parts.Add($"Definition: \"{definition}\"");
        if (!string.IsNullOrWhiteSpace(sentence))
            parts.Add($"Context: \"{sentence}\"");

        parts.Add($"Language: {language}");
        parts.Add("");
        parts.Add("Task 1 - Distractors: Generate 5 wrong-answer words that:");
        parts.Add($"- Same part of speech as \"{word}\"");
        parts.Add("- Similar difficulty level");
        parts.Add("- NOT synonyms");
        parts.Add("- Could plausibly confuse a learner");
        parts.Add("- SINGLE WORD ONLY — no spaces, no multi-word phrases (use \"linearizability\" not \"strong consistency\"; \"sharding\" not \"data partitioning\"). Hyphens are fine.");
        parts.Add("");
        parts.Add("Task 2 - Hint: Write ONE short sentence (under 15 words) describing what this word means.");
        parts.Add($"Do NOT use the word \"{word}\" or direct synonyms in the hint.");
        parts.Add("");
        parts.Add($"Task 3 - Explanation: Write 2-3 sentences in {nativeLanguage} explaining the meaning of \"{word}\".");
        if (!string.IsNullOrWhiteSpace(sentence))
            parts.Add($"Include how it is used in this context: \"{sentence}\"");
        parts.Add("");
        parts.Add("Reply in this EXACT format (no other text):");
        parts.Add("DISTRACTORS: word1, word2, word3, word4, word5");
        parts.Add("HINT: your hint sentence here");
        parts.Add("EXPLANATION: your explanation here");

        return (system, string.Join("\n", parts));
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
