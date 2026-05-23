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

    public static bool IsTableOfContents(string? title)
    {
        if (string.IsNullOrWhiteSpace(title)) return false;
        // Tolerate trailing numbers/page refs the bookmark sometimes carries.
        var normalized = Regex.Replace(title, @"\s*\d+\s*$", "").Trim();
        return TocTitle.IsMatch(normalized);
    }

    /// <summary>
    /// Content-level TOC detection — used when the bookmark title doesn't
    /// match (e.g. page-split fallback labels the chapter "Pages 1–15"). A
    /// chapter where ≥40% of substantive lines end with a leader-dot run
    /// plus a page number is overwhelmingly likely to be a TOC. Threshold
    /// kept conservative on purpose; real reading chapters almost never have
    /// 40% of their lines ending in "...47".
    /// </summary>
    public static bool LooksLikeTableOfContentsBody(string? plainText)
    {
        if (string.IsNullOrWhiteSpace(plainText)) return false;

        var lines = plainText.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        // Filter out very short lines — running headers, page numbers, stray
        // glyphs would skew the ratio either way on a short chapter.
        var significant = lines.Where(l => l.Trim().Length >= 4).ToList();
        if (significant.Count < 5) return false;

        var leaderLines = significant.Count(l => TocLeaderLine.IsMatch(l));
        return leaderLines * 100 >= significant.Count * 40;
    }
}
