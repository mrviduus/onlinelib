using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;

namespace Application.Tools;

/// <summary>
/// Phase 5 starter tool (AI-030): looks a word up in the Free Dictionary API (the same upstream the
/// public /dictionary endpoint proxies) and returns a compact entry — phonetic + first few meanings.
/// "Not found" is data (<c>found:false</c>), not an error, so the model moves on instead of retrying.
/// </summary>
public sealed class LookupDictionaryTool : ITool
{
    private const int MaxMeanings = 3;
    private const int MaxDefinitionsPerMeaning = 2;
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    private static readonly JsonElement Schema = ToolJson.Schema("""
        {
          "type": "object",
          "properties": {
            "word": {
              "type": "string",
              "minLength": 1,
              "maxLength": 100,
              "description": "The word to look up"
            },
            "lang": {
              "type": "string",
              "minLength": 2,
              "maxLength": 5,
              "description": "ISO language code of the word (default en)"
            }
          },
          "required": ["word"],
          "additionalProperties": false
        }
        """);

    public string Name => "lookup_dictionary";

    public string Description =>
        "Look up a word's dictionary definition (with phonetics and parts of speech). " +
        "Use when the precise dictionary meaning matters for the explanation.";

    public JsonElement ArgsSchema => Schema;

    public async Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct)
    {
        var word = ToolJson.GetString(args, "word")!.Trim(); // shape guaranteed by schema validation
        var lang = ToolJson.GetString(args, "lang")?.ToLowerInvariant() ?? "en";

        var client = ctx.Services.GetRequiredService<IHttpClientFactory>().CreateClient();
        client.Timeout = Timeout;

        var url = $"https://api.dictionaryapi.dev/api/v2/entries/{lang}/{Uri.EscapeDataString(word)}";
        using var response = await client.GetAsync(url, ct);

        if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            return ToolJson.Result(new { found = false, word, message = $"No dictionary entry for '{word}'." });
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"Dictionary service returned {(int)response.StatusCode}.");

        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        return ParseEntry(doc.RootElement, word);
    }

    /// <summary>Compacts the Free Dictionary payload to phonetic + top meanings. Pure — unit-tested.</summary>
    public static JsonElement ParseEntry(JsonElement payload, string word)
    {
        if (payload.ValueKind != JsonValueKind.Array || payload.GetArrayLength() == 0)
            return ToolJson.Result(new { found = false, word, message = $"No dictionary entry for '{word}'." });

        var entry = payload[0];
        var phonetic = entry.TryGetProperty("phonetic", out var ph) && ph.ValueKind == JsonValueKind.String
            ? ph.GetString()
            : null;

        var meanings = new List<object>();
        if (entry.TryGetProperty("meanings", out var ms) && ms.ValueKind == JsonValueKind.Array)
        {
            foreach (var m in ms.EnumerateArray().Take(MaxMeanings))
            {
                var pos = m.TryGetProperty("partOfSpeech", out var p) && p.ValueKind == JsonValueKind.String
                    ? p.GetString()
                    : "unknown";
                var defs = new List<string>();
                if (m.TryGetProperty("definitions", out var ds) && ds.ValueKind == JsonValueKind.Array)
                {
                    foreach (var d in ds.EnumerateArray().Take(MaxDefinitionsPerMeaning))
                    {
                        if (d.TryGetProperty("definition", out var def) && def.ValueKind == JsonValueKind.String)
                            defs.Add(def.GetString()!);
                    }
                }
                meanings.Add(new { partOfSpeech = pos, definitions = defs });
            }
        }

        return ToolJson.Result(new { found = true, word, phonetic, meanings });
    }
}
