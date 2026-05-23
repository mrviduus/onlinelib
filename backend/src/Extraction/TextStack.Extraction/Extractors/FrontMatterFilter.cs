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

    public static bool IsTableOfContents(string? title)
    {
        if (string.IsNullOrWhiteSpace(title)) return false;
        // Tolerate trailing numbers/page refs the bookmark sometimes carries.
        var normalized = Regex.Replace(title, @"\s*\d+\s*$", "").Trim();
        return TocTitle.IsMatch(normalized);
    }
}
