using System.Text.RegularExpressions;

namespace TextStack.Extraction.Extractors;

/// <summary>
/// Identifies low-value front-matter chapter titles that should be dropped at
/// extraction time. Right now: only "Table of Contents" (and translated
/// variants) — TOC chapters from PDFs come out as a flat run of leader-dotted
/// entries with no usable line breaks; they add nothing to the in-app TOC
/// (which we generate from the chapter list itself) and just waste a click.
/// Kept narrow on purpose — adding e.g. "Copyright" or "Index" here would
/// silently drop content some users want to keep.
/// </summary>
public static class FrontMatterFilter
{
    private static readonly Regex TocTitle = new(
        @"^\s*(table\s+of\s+contents?|contents|toc|" +
        @"оглавление|содержание|зміст|" +
        @"sommaire|inhaltsverzeichnis|índice|indice|sumário)\s*$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // A TOC entry line is "Chapter Title ... 47" — text + leader dots/ellipsis
    // + a page number at the end. The leader can be ASCII "....", a run of
    // spaced dots ". . . .", or "…" (U+2026, sometimes repeated).
    private static readonly Regex TocLeaderLine = new(
        @"(\.{3,}|(?:\.\s+){2,}\.|…(?:\s*…)*)\s*\d{1,4}\s*$",
        RegexOptions.Compiled);

    // Back-matter titles that look like a TOC content-wise (leader dots + page
    // numbers) but are legitimate reading content. Used to veto a positive
    // LooksLikeTableOfContentsBody result. Index and Glossary in particular
    // are the classic false-positive cases: "JavaScript ............ 47, 89".
    private static readonly Regex BackMatterTitle = new(
        @"^\s*(index|glossary|bibliography|references|notes|" +
        @"abbreviations|colophon|" +
        @"индекс|глоссарий|библиография|примечания|" +
        @"індекс|глосарій|бібліографія|примітки)\s*$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static bool IsTableOfContents(string? title)
    {
        if (string.IsNullOrWhiteSpace(title)) return false;
        // Tolerate trailing numbers/page refs the bookmark sometimes carries.
        var normalized = Regex.Replace(title, @"\s*\d+\s*$", "").Trim();
        return TocTitle.IsMatch(normalized);
    }

    /// <summary>
    /// True when the title matches a known back-matter section that we must
    /// NOT drop even if its content-shape looks like a TOC (Index, Glossary,
    /// Bibliography, etc.).
    /// </summary>
    public static bool IsKnownBackMatter(string? title)
    {
        if (string.IsNullOrWhiteSpace(title)) return false;
        return BackMatterTitle.IsMatch(title.Trim());
    }

    // Split chapter HTML by paragraph-ish block ends. The pipeline collapses
    // \s+ → " " in plain text so newlines disappear; using </p> as the line
    // boundary keeps each TOC entry intact as a separate item to match.
    private static readonly Regex ParagraphSplit = new(
        @"</p>|</h\d>|</li>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex TagStripRegex = new(@"<[^>]+>", RegexOptions.Compiled);

    /// <summary>
    /// Content-level TOC detection — used when the bookmark title doesn't
    /// match (e.g. page-split fallback labels the chapter "Pages 1–15").
    /// Takes chapter HTML (NOT pipeline plainText — that's a single line by
    /// the time it reaches us). Splits by block-end tags and counts
    /// paragraphs ending in a leader-dot run plus a page number. ≥40% ⇒ TOC.
    /// </summary>
    public static bool LooksLikeTableOfContentsBody(string? html)
    {
        if (string.IsNullOrWhiteSpace(html)) return false;

        var blocks = ParagraphSplit.Split(html);
        var significant = blocks
            .Select(b => System.Net.WebUtility.HtmlDecode(TagStripRegex.Replace(b, "")).Trim())
            .Where(s => s.Length >= 4)
            .ToList();
        if (significant.Count < 5) return false;

        var leaderLines = significant.Count(s => TocLeaderLine.IsMatch(s));
        return leaderLines * 100 >= significant.Count * 40;
    }
}
