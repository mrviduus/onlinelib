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
    internal static readonly Regex TocLeaderLine = new(
        @"(\.{3,}|(?:\.\s+){2,}\.|…(?:\s*…)*)\s*\d{1,4}\s*$",
        RegexOptions.Compiled);

    // Global form of the leader-line pattern: matches "Title <leaders> PageNum"
    // anywhere so a whole flattened TOC blob (many entries glued into one
    // paragraph, tab- or space-separated) can be split into its entries.
    // Group 1 = the title text, group 2 = the printed page number. The title
    // stops at the leader run; a leading tab (entry separator) is trimmed by
    // the caller. Kept internal so PdfTocParser can reuse the exact same
    // recognizer the drop-logic uses.
    internal static readonly Regex TocEntryGlobal = new(
        @"([^\t]+?)\s*(?:\.{3,}|(?:\.\s+){2,}\.|…(?:\s*…)*)\s*(\d{1,4})",
        RegexOptions.Compiled);

    // Back-matter titles that look like a TOC content-wise (leader dots + page
    // numbers) but are legitimate reading content. Used to veto a positive
    // LooksLikeTableOfContentsBody result. Index and Glossary in particular
    // are the classic false-positive cases: "JavaScript ............ 47, 89".
    // Top European languages covered explicitly; lookalike scripts (Russian /
    // Ukrainian, German, French, Spanish, Italian, Portuguese).
    private static readonly Regex BackMatterTitle = new(
        @"^\s*(" +
        @"index|glossary|bibliography|references|notes|" +
        @"abbreviations|colophon|appendix|" +
        // ru
        @"индекс|глоссарий|библиография|примечания|приложение|" +
        // uk
        @"індекс|глосарій|бібліографія|примітки|додаток|" +
        // de
        @"glossar|literaturverzeichnis|anmerkungen|bibliographie|anhang|" +
        // fr
        @"glossaire|références|annexe|" +
        // es / pt
        @"índice|glosario|bibliografía|notas|referencias|apéndice|anexo|" +
        @"glossário|bibliografia|referências|apêndice|" +
        // it
        @"indice|glossario|riferimenti|appendice" +
        @")\s*$",
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

    /// <summary>
    /// Content-level TOC detection — used when the bookmark title doesn't
    /// match (e.g. page-split fallback labels the chapter "Pages 1–15").
    /// Takes the per-paragraph text BEFORE HTML conversion / typography
    /// processing — that's where the structure we need still exists. (After
    /// the pipeline, plainText is `\s+`-collapsed and there are no paragraph
    /// boundaries left to count.) A chapter where ≥40% of substantive
    /// paragraphs end in a leader-dot run plus a page number is
    /// overwhelmingly likely to be a TOC. Threshold kept conservative; real
    /// reading chapters almost never have 40% of paragraphs ending in "...47".
    /// </summary>
    public static bool LooksLikeTableOfContentsBody(IEnumerable<string>? paragraphTexts)
    {
        if (paragraphTexts is null) return false;

        var significant = paragraphTexts
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s.Trim())
            .Where(s => s.Length >= 4)
            .ToList();
        if (significant.Count < 5) return false;

        var leaderLines = significant.Count(s => TocLeaderLine.IsMatch(s));
        return leaderLines * 100 >= significant.Count * 40;
    }
}
