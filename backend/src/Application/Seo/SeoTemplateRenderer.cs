using System.Text.RegularExpressions;

namespace Application.Seo;

/// <summary>
/// Renders `{placeholder}` substitutions in a template using a case-insensitive placeholder map.
/// Each value is sanitized before insertion (prompt-injection defense).
/// Missing placeholders are kept literally (e.g. "{books}") — callers decide if that's a hard error.
/// </summary>
public static class SeoTemplateRenderer
{
    private static readonly Regex PlaceholderPattern = new(@"\{([a-zA-Z_][a-zA-Z0-9_]*)\}", RegexOptions.Compiled);

    public static string Render(string template, IReadOnlyDictionary<string, string?> values)
    {
        if (string.IsNullOrEmpty(template)) return string.Empty;

        // Normalize keys to lowercase for case-insensitive lookup
        var normalized = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var kv in values)
            normalized[kv.Key] = SeoPromptSanitizer.Sanitize(kv.Value);

        return PlaceholderPattern.Replace(template, match =>
        {
            var key = match.Groups[1].Value;
            return normalized.TryGetValue(key, out var value) ? value : match.Value;
        });
    }

    /// <summary>Returns placeholder names that exist in the template but are not in the values map.</summary>
    public static IReadOnlyList<string> FindMissingPlaceholders(string template, IReadOnlyDictionary<string, string?> values)
    {
        var keys = new HashSet<string>(values.Keys, StringComparer.OrdinalIgnoreCase);
        var missing = new List<string>();
        foreach (Match m in PlaceholderPattern.Matches(template))
        {
            var name = m.Groups[1].Value;
            if (!keys.Contains(name) && !missing.Contains(name, StringComparer.OrdinalIgnoreCase))
                missing.Add(name);
        }
        return missing;
    }
}
