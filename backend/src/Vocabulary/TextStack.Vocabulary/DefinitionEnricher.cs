using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace TextStack.Vocabulary;

public sealed class DefinitionEnricher : IDefinitionEnricher
{
    private const string ApiBaseUrl = "https://api.dictionaryapi.dev/api/v2/entries";

    private readonly IHttpClientFactory _httpClientFactory;

    public DefinitionEnricher(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    public async Task<string?> FetchDefinitionAsync(string word, string language, CancellationToken ct)
    {
        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(10);

        var langCode = NormalizeLanguage(language);
        var url = $"{ApiBaseUrl}/{langCode}/{Uri.EscapeDataString(word)}";

        var response = await client.GetAsync(url, ct);
        if (!response.IsSuccessStatusCode)
            return null;

        var entries = await response.Content.ReadFromJsonAsync<List<DictEntry>>(ct);
        if (entries is not { Count: > 0 })
            return null;

        return FormatDefinition(entries[0]);
    }

    private static string? FormatDefinition(DictEntry entry)
    {
        if (entry.Meanings is not { Count: > 0 })
            return null;

        var parts = new List<string>();

        foreach (var meaning in entry.Meanings.Take(3))
        {
            if (string.IsNullOrWhiteSpace(meaning.PartOfSpeech))
                continue;

            var defs = meaning.Definitions?.Take(2).ToList();
            if (defs is not { Count: > 0 })
                continue;

            var pos = char.ToUpper(meaning.PartOfSpeech[0]) + meaning.PartOfSpeech[1..];
            var defTexts = defs.Select((d, i) => $"{i + 1}. {d.Definition}");
            parts.Add($"{pos}: {string.Join(" ", defTexts)}");
        }

        if (parts.Count == 0)
            return null;

        var result = string.Join("\n", parts);
        return result.Length > 2000 ? result[..2000] : result;
    }

    private static string NormalizeLanguage(string lang) =>
        lang.ToLowerInvariant() switch
        {
            "en" or "english" => "en",
            "de" or "german" => "de",
            "fr" or "french" => "fr",
            "es" or "spanish" => "es",
            _ => lang.ToLowerInvariant()
        };

    private class DictEntry
    {
        [JsonPropertyName("word")]
        public string? Word { get; set; }

        [JsonPropertyName("meanings")]
        public List<DictMeaning>? Meanings { get; set; }
    }

    private class DictMeaning
    {
        [JsonPropertyName("partOfSpeech")]
        public string? PartOfSpeech { get; set; }

        [JsonPropertyName("definitions")]
        public List<DictDef>? Definitions { get; set; }
    }

    private class DictDef
    {
        [JsonPropertyName("definition")]
        public string? Definition { get; set; }
    }
}
