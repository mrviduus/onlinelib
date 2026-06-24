using System.Text.RegularExpressions;

namespace Application.Tools;

/// <summary>
/// Neutralizes prompt-injection vectors in text fetched from external catalogs (Open Library, etc.)
/// before it enters an LLM prompt as a tool observation. Mirrors <see cref="Application.Seo.SeoPromptSanitizer"/>
/// but tuned for book metadata: it strips role-switch / template / end-of-prompt markers and obvious
/// "ignore previous instructions" payloads, while leaving normal prose (descriptions, subjects) intact.
/// External text is DATA, never instructions — this is the boundary that enforces it.
/// </summary>
public static class ExternalTextSanitizer
{
    private static readonly Regex[] Patterns =
    {
        new(@"\{\{|\}\}", RegexOptions.Compiled),
        new(@"</?(prompt|system|instructions)>", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\b(system|assistant|developer|human)\s*:", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"<\|[^>]{0,50}\|>", RegexOptions.Compiled),
        new(@"ignore\s+((all|the|any|previous|above|prior|earlier)\s+){1,3}(instructions|prompts|context)",
            RegexOptions.Compiled | RegexOptions.IgnoreCase),
    };

    /// <summary>Returns a sanitized copy (never null → empty string), or null if the input was null/empty.</summary>
    public static string? Clean(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        var cleaned = input;
        foreach (var pattern in Patterns)
            cleaned = pattern.Replace(cleaned, " ");
        cleaned = Regex.Replace(cleaned, @"\s{3,}", "  ").Trim();
        return cleaned.Length == 0 ? null : cleaned;
    }
}
