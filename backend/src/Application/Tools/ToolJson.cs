using System.Text.Json;

namespace Application.Tools;

/// <summary>
/// Small shared helpers for the Phase 5 tools (AI-030): parse a schema string once into the
/// <see cref="JsonElement"/> the <c>ITool.ArgsSchema</c> contract wants, read already-validated
/// arguments, and serialize results. Argument SHAPE is guaranteed by the dispatcher's JSON-Schema
/// validation — these readers only extract.
/// </summary>
internal static class ToolJson
{
    /// <summary>Parses a JSON-Schema literal into a detached, reusable element (held in a static).</summary>
    public static JsonElement Schema(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    public static string? GetString(JsonElement args, string name) =>
        args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString()
            : null;

    public static int? GetInt(JsonElement args, string name) =>
        args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number
            ? v.GetInt32()
            : null;

    public static JsonElement Result<T>(T value) => JsonSerializer.SerializeToElement(value, JsonOpts);

    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    /// <summary>Truncates tool output text so one tool call can't blow the prompt budget.</summary>
    public static (string Text, bool Truncated) Truncate(string text, int maxChars) =>
        text.Length <= maxChars ? (text, false) : (text[..maxChars], true);
}
