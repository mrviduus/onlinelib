using System.Text.Json;

namespace Application.Seo;

/// <summary>
/// Lightweight JSON-schema validator. Not full JSON Schema — supports the subset used by SEO templates:
/// type (object/array/string/integer/number/boolean), required, properties, items,
/// minLength, maxLength, minItems, maxItems.
/// Pulling in a full schema library (e.g. NJsonSchema) is deferred until Phase 2 needs it.
/// </summary>
public static class SeoContentValidator
{
    public readonly record struct ValidationResult(bool IsValid, IReadOnlyList<string> Errors)
    {
        public static ValidationResult Ok() => new(true, Array.Empty<string>());
        public static ValidationResult Fail(params string[] errors) => new(false, errors);
    }

    public static ValidationResult Validate(JsonElement value, string schemaJson)
    {
        JsonElement schema;
        try
        {
            using var doc = JsonDocument.Parse(schemaJson);
            schema = doc.RootElement.Clone();
        }
        catch (JsonException ex)
        {
            return ValidationResult.Fail($"Schema is not valid JSON: {ex.Message}");
        }

        var errors = new List<string>();
        Walk(value, schema, "$", errors);
        return errors.Count == 0 ? ValidationResult.Ok() : new ValidationResult(false, errors);
    }

    private static void Walk(JsonElement value, JsonElement schema, string path, List<string> errors)
    {
        if (!schema.TryGetProperty("type", out var typeEl)) return;
        var expected = typeEl.GetString();

        switch (expected)
        {
            case "object":
                if (value.ValueKind != JsonValueKind.Object)
                {
                    errors.Add($"{path}: expected object, got {value.ValueKind}");
                    return;
                }
                if (schema.TryGetProperty("required", out var required) && required.ValueKind == JsonValueKind.Array)
                {
                    foreach (var req in required.EnumerateArray())
                    {
                        var key = req.GetString();
                        if (key is null) continue;
                        if (!value.TryGetProperty(key, out _))
                            errors.Add($"{path}: missing required property '{key}'");
                    }
                }
                if (schema.TryGetProperty("properties", out var props) && props.ValueKind == JsonValueKind.Object)
                {
                    foreach (var prop in props.EnumerateObject())
                    {
                        if (value.TryGetProperty(prop.Name, out var child))
                            Walk(child, prop.Value, $"{path}.{prop.Name}", errors);
                    }
                }
                break;

            case "array":
                if (value.ValueKind != JsonValueKind.Array)
                {
                    errors.Add($"{path}: expected array, got {value.ValueKind}");
                    return;
                }
                var len = value.GetArrayLength();
                if (schema.TryGetProperty("minItems", out var minI) && len < minI.GetInt32())
                    errors.Add($"{path}: expected at least {minI.GetInt32()} items, got {len}");
                if (schema.TryGetProperty("maxItems", out var maxI) && len > maxI.GetInt32())
                    errors.Add($"{path}: expected at most {maxI.GetInt32()} items, got {len}");
                if (schema.TryGetProperty("items", out var items))
                {
                    var idx = 0;
                    foreach (var item in value.EnumerateArray())
                    {
                        Walk(item, items, $"{path}[{idx}]", errors);
                        idx++;
                    }
                }
                break;

            case "string":
                if (value.ValueKind != JsonValueKind.String)
                {
                    errors.Add($"{path}: expected string, got {value.ValueKind}");
                    return;
                }
                var s = value.GetString() ?? "";
                if (schema.TryGetProperty("minLength", out var minL) && s.Length < minL.GetInt32())
                    errors.Add($"{path}: string too short ({s.Length} < {minL.GetInt32()})");
                if (schema.TryGetProperty("maxLength", out var maxL) && s.Length > maxL.GetInt32())
                    errors.Add($"{path}: string too long ({s.Length} > {maxL.GetInt32()})");
                break;

            case "integer":
                if (value.ValueKind != JsonValueKind.Number || !value.TryGetInt64(out _))
                    errors.Add($"{path}: expected integer, got {value.ValueKind}");
                break;

            case "number":
                if (value.ValueKind != JsonValueKind.Number)
                    errors.Add($"{path}: expected number, got {value.ValueKind}");
                break;

            case "boolean":
                if (value.ValueKind != JsonValueKind.True && value.ValueKind != JsonValueKind.False)
                    errors.Add($"{path}: expected boolean, got {value.ValueKind}");
                break;
        }
    }
}
