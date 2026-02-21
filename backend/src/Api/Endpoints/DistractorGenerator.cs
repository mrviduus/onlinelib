using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace Api.Endpoints;

public static class DistractorGenerator
{
    public static async Task<List<string>?> GenerateAsync(
        string word, string language, string? definition, string? sentence,
        IHttpClientFactory httpClientFactory, IConfiguration config,
        CancellationToken ct)
    {
        var baseUrl = config.GetValue<string>("Ollama:BaseUrl") ?? "http://localhost:11434";
        var model = config.GetValue<string>("Ollama:Model") ?? "gemma3:4b";
        var timeout = config.GetValue("Ollama:TimeoutSeconds", 10);

        var prompt = BuildPrompt(word, language, definition, sentence);

        var client = httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(timeout);

        var request = new { model, prompt, stream = false };
        var response = await client.PostAsJsonAsync($"{baseUrl}/api/generate", request, ct);

        if (!response.IsSuccessStatusCode)
            return null;

        var result = await response.Content.ReadFromJsonAsync<OllamaResponse>(ct);
        if (string.IsNullOrWhiteSpace(result?.Response))
            return null;

        return ParseResponse(result.Response, word);
    }

    private static string BuildPrompt(string word, string language, string? definition, string? sentence)
    {
        var parts = new List<string>
        {
            "You generate vocabulary quiz distractors for language learners.",
            "",
            $"Word: \"{word}\"",
        };

        if (!string.IsNullOrWhiteSpace(definition))
            parts.Add($"Definition: \"{definition}\"");
        if (!string.IsNullOrWhiteSpace(sentence))
            parts.Add($"Context: \"{sentence}\"");

        parts.Add($"Language: {language}");
        parts.Add("");
        parts.Add("Generate 5 wrong-answer words that:");
        parts.Add($"- Same part of speech as \"{word}\"");
        parts.Add("- Similar difficulty level");
        parts.Add("- NOT synonyms");
        parts.Add("- Could plausibly confuse a learner");
        parts.Add("");
        parts.Add("Reply ONLY comma-separated words. No explanations.");

        return string.Join("\n", parts);
    }

    private static List<string>? ParseResponse(string raw, string originalWord)
    {
        // LLM returns comma-separated words, possibly with numbering or extra whitespace
        var words = raw
            .Replace("\n", ",")
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
