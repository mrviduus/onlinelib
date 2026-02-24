using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace Api.Endpoints;

public static class DistractorGenerator
{
    public static async Task<(List<string>? Distractors, string? Hint)> GenerateAsync(
        string word, string language, string? definition, string? sentence,
        IHttpClientFactory httpClientFactory, IConfiguration config,
        CancellationToken ct)
    {
        var baseUrl = config.GetValue<string>("Ollama:BaseUrl") ?? "http://localhost:11434";
        var model = config.GetValue<string>("Ollama:Model") ?? "gemma3:4b";
        var timeout = config.GetValue("Ollama:TimeoutSeconds", 30);

        var prompt = BuildPrompt(word, language, definition, sentence);

        var client = httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(timeout);

        var request = new { model, prompt, stream = false };
        var response = await client.PostAsJsonAsync($"{baseUrl}/api/generate", request, ct);

        if (!response.IsSuccessStatusCode)
            return (null, null);

        var result = await response.Content.ReadFromJsonAsync<OllamaResponse>(ct);
        if (string.IsNullOrWhiteSpace(result?.Response))
            return (null, null);

        return ParseStructuredResponse(result.Response, word);
    }

    private static string BuildPrompt(string word, string language, string? definition, string? sentence)
    {
        var parts = new List<string>
        {
            "You generate vocabulary quiz data for language learners.",
            "",
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
        parts.Add("");
        parts.Add("Task 2 - Hint: Write ONE short sentence (under 15 words) describing what this word means.");
        parts.Add($"Do NOT use the word \"{word}\" or direct synonyms in the hint.");
        parts.Add("");
        parts.Add("Reply in this EXACT format (no other text):");
        parts.Add("DISTRACTORS: word1, word2, word3, word4, word5");
        parts.Add("HINT: your hint sentence here");

        return string.Join("\n", parts);
    }

    private static (List<string>? Distractors, string? Hint) ParseStructuredResponse(string raw, string originalWord)
    {
        var lines = raw.Split('\n', StringSplitOptions.TrimEntries);
        string? distractorLine = null;
        string? hintLine = null;

        foreach (var line in lines)
        {
            if (line.StartsWith("DISTRACTORS:", StringComparison.OrdinalIgnoreCase))
                distractorLine = line["DISTRACTORS:".Length..].Trim();
            else if (line.StartsWith("HINT:", StringComparison.OrdinalIgnoreCase))
                hintLine = line["HINT:".Length..].Trim();
        }

        // Parse distractors from structured line, or fall back to old comma parsing
        var distractors = distractorLine != null
            ? ParseWordList(distractorLine, originalWord)
            : ParseWordList(raw.Replace("\n", ","), originalWord);

        // Validate hint
        string? hint = null;
        if (!string.IsNullOrWhiteSpace(hintLine)
            && hintLine.Length < 500
            && !hintLine.Contains(originalWord, StringComparison.OrdinalIgnoreCase))
        {
            hint = hintLine;
        }

        return (distractors, hint);
    }

    private static List<string>? ParseWordList(string raw, string originalWord)
    {
        var words = raw
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(w => w.TrimStart('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '-', ' ').Trim())
            .Where(w => w.Length > 0
                && w.Length < 50
                && !w.Equals(originalWord, StringComparison.OrdinalIgnoreCase)
                && !w.Contains(' ')) // single words only
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(5)
            .Select(w => w.ToLowerInvariant())
            .ToList();

        return words.Count >= 3 ? words : null;
    }
}

file class OllamaResponse
{
    public string Response { get; set; } = "";
}
