using System.Text.RegularExpressions;

namespace TextStack.Extraction.Utilities;

/// <summary>
/// Cleans up book titles read from source-format metadata.
/// </summary>
/// <remarks>
/// Real-world EPUBs (notably O'Reilly Atlas Early Release editions) ship
/// titles like "Designing Data-Intensive Applications (for ${atlas.author_email})".
/// Some retail/Calibre pipelines strip the variable but leave the parens →
/// titles surface as "X (for  )" in the library, which looks broken to users.
///
/// We strip the parenthetical when it is empty, whitespace-only, or matches
/// a known template syntax (${var}, {{var}}, $var, %name). Parentheticals
/// with real content (e.g. "(for beginners)", "(2nd ed.)") are preserved.
/// </remarks>
public static class BookTitleCleaner
{
    // Class for "non-content" chars between `for` and `)` — regular whitespace
    // (\s = \p{Z} + tabs/CR/LF), Unicode format chars (\p{Cf} — covers ZWSP
    // U+200B, ZWJ U+200D, BOM U+FEFF, soft hyphen U+00AD, etc.). EPUB metadata
    // pipelines that strip variables sometimes leave these invisible chars
    // behind, so plain `\s*` misses them and the cleaner returns the title
    // unchanged.
    private const string Empty = @"[\s\p{Cf}]*";

    // Tail "(for ...)" where the inside is empty (incl. invisible chars) or
    // a known template placeholder syntax (${var} / {{var}} / $var / %var).
    private static readonly Regex EmptyForParens = new(
        @"[\s\p{Cf}]*\(" + Empty + @"for\b(?:" + Empty +
        @"(?:\$\{[^}]*\}|\{\{[^}]*\}\}|\$[A-Za-z_][\w.]*|%\w+))?" + Empty + @"\)" + Empty + @"$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    // Generic empty parens at the tail (e.g. "Title ()" or "Title (   )").
    private static readonly Regex EmptyTailParens = new(
        Empty + @"\(" + Empty + @"\)" + Empty + @"$",
        RegexOptions.Compiled);

    // Standalone template placeholders anywhere in the title.
    private static readonly Regex TemplatePlaceholder = new(
        @"\$\{[^}]*\}|\{\{[^}]*\}\}|\$[A-Za-z_][\w.]*",
        RegexOptions.Compiled);

    /// <summary>
    /// Returns a cleaned title or the input unchanged. Null/empty pass through.
    /// </summary>
    public static string? Clean(string? title)
    {
        if (string.IsNullOrWhiteSpace(title))
            return title;

        var s = title;

        // Strip leftover template placeholders before re-checking parens —
        // catches "X (for ${var})" → "X (for )" → trailing-paren rule.
        s = TemplatePlaceholder.Replace(s, string.Empty);

        // Repeat to handle nested wrappers like "X (for ${a} ${b})" → "X ()".
        for (var i = 0; i < 3; i++)
        {
            var before = s;
            s = EmptyForParens.Replace(s, string.Empty);
            s = EmptyTailParens.Replace(s, string.Empty);
            if (s == before) break;
        }

        return s.Trim();
    }
}
