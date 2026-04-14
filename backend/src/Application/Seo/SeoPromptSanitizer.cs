using System.Text.RegularExpressions;

namespace Application.Seo;

/// <summary>
/// Strips prompt-injection vectors from untrusted entity text before insertion into a template.
/// Content from DB may include text copied from user uploads or external sources — treat as untrusted.
/// </summary>
public static class SeoPromptSanitizer
{
    // Common prompt-leak markers used to redirect Claude: role switches, system injections,
    // template delimiters, end-of-prompt markers, Anthropic-style tag boundaries.
    private static readonly Regex[] Patterns =
    {
        new(@"\{\{", RegexOptions.Compiled),
        new(@"\}\}", RegexOptions.Compiled),
        new(@"</prompt>", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"<prompt>", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"assistant\s*:", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"system\s*:", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"human\s*:", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"<\|[^>]{0,50}\|>", RegexOptions.Compiled),
        new(@"ignore (previous|all|above) (instructions|prompts)", RegexOptions.Compiled | RegexOptions.IgnoreCase),
    };

    public static string Sanitize(string? input)
    {
        if (string.IsNullOrEmpty(input)) return string.Empty;
        var cleaned = input;
        foreach (var pattern in Patterns)
            cleaned = pattern.Replace(cleaned, "");
        // Collapse excessive whitespace
        cleaned = Regex.Replace(cleaned, @"\s{3,}", "  ");
        return cleaned.Trim();
    }
}
