using System.Text.RegularExpressions;
using UglyToad.PdfPig;

namespace TextStack.Extraction.Extractors.Pdf;

/// <summary>
/// Parses a PDF's Table of Contents (leader-dot "TITLE …… 9" lines) into an
/// ordered list of section titles, then anchors each title to the physical page
/// where it FIRST appears as a heading in the body.
///
/// Why match by content instead of trusting the TOC's printed page number:
/// Word→Quartz exports have a printed-vs-physical page offset (front matter,
/// cover, part-divider pages), so "…… 9" rarely means physical page 9. Matching
/// the title text against the body's page-leading element sidesteps the offset
/// entirely and yields BOTH the clean chapter name and its real physical page.
///
/// Self-limiting by design: a TOC lists both top-level sections and sub-entries,
/// but only the ones that actually START a body page (their normalized title is
/// the page's first text element) become anchors. Sub-entries glued mid-page are
/// dropped, so we get sensible chapter granularity without hard-coding levels.
/// </summary>
public static class PdfTocParser
{
    // A page counts as part of the TOC when this fraction of its non-trivial
    // text is leader-dot entries. TOC pages are almost entirely entries.
    private const double TocPageEntryRatio = 0.5;
    private const int MaxTocScanPages = 30;
    private const int MinTitleLength = 3;
    private const int MaxTitleLength = 120;

    public static List<ChapterRange> TryDetect(PdfDocument document, int pageCount)
    {
        try
        {
            var (titles, lastTocPage) = ParseTocTitles(document, pageCount);
            if (titles.Count < 2)
                return [];

            // Cache each body page's leading normalized text once.
            var bodyStart = Math.Max(1, lastTocPage + 1);
            var pageLeads = new Dictionary<int, string>();
            for (var p = bodyStart; p <= pageCount; p++)
            {
                var lead = LeadingText(document, p);
                if (lead.Length > 0)
                    pageLeads[p] = lead;
            }

            // Anchor each title to the FIRST body page whose leading text starts
            // with it. Titles are consumed in order and pages must advance, so a
            // repeated heading (e.g. a running motif) can't pull a later chapter
            // backwards.
            var anchors = new List<(string Title, int Page)>();
            var searchFrom = bodyStart;
            foreach (var title in titles)
            {
                var norm = Normalize(title);
                if (norm.Length < MinTitleLength)
                    continue;

                var matchPage = -1;
                for (var p = searchFrom; p <= pageCount; p++)
                {
                    if (pageLeads.TryGetValue(p, out var lead)
                        && lead.StartsWith(norm, StringComparison.OrdinalIgnoreCase))
                    {
                        matchPage = p;
                        break;
                    }
                }

                if (matchPage < 0)
                    continue;

                // Collapse multiple TOC entries that resolve to the same physical
                // page into a single chapter (keep the first / most specific).
                if (anchors.Count > 0 && anchors[^1].Page == matchPage)
                    continue;

                anchors.Add((CleanTitle(title), matchPage));
                searchFrom = matchPage + 1;
            }

            if (anchors.Count < 2)
                return [];

            var result = new List<ChapterRange>();
            for (var i = 0; i < anchors.Count; i++)
            {
                var endPage = i < anchors.Count - 1
                    ? anchors[i + 1].Page - 1
                    : pageCount;
                result.Add(new ChapterRange(anchors[i].Title, anchors[i].Page, endPage));
            }

            return result;
        }
        catch
        {
            return [];
        }
    }

    /// <summary>
    /// Scans the front of the document for TOC pages and pulls the ordered list
    /// of entry titles out of them. Returns the titles plus the last physical
    /// page that belonged to the TOC (so the body search can start after it).
    /// </summary>
    internal static (List<string> Titles, int LastTocPage) ParseTocTitles(PdfDocument document, int pageCount)
    {
        var titles = new List<string>();
        var lastTocPage = 0;
        var scanLimit = Math.Min(pageCount, MaxTocScanPages);
        var seenTocPage = false;

        for (var p = 1; p <= scanLimit; p++)
        {
            var elements = PdfPageTextExtractor.ExtractPage(document.GetPage(p));
            if (elements.Count == 0)
                continue;

            var pageText = string.Join(" \t ", elements.Select(e => e.Text));
            var entries = FrontMatterFilter.TocEntryGlobal.Matches(pageText);
            if (entries.Count == 0)
            {
                // A blank / non-TOC page after we've started the TOC ends it.
                if (seenTocPage)
                    break;
                continue;
            }

            // Guard against a body page that merely has a couple of dotted
            // lines: require entries to dominate the page's text.
            var entryTextLen = entries.Sum(m => m.Value.Length);
            if (!seenTocPage && entryTextLen < pageText.Length * TocPageEntryRatio)
                continue;

            seenTocPage = true;
            lastTocPage = p;
            foreach (Match m in entries)
            {
                var title = m.Groups[1].Value;
                var norm = Normalize(title);
                if (norm.Length is >= MinTitleLength and <= MaxTitleLength)
                    titles.Add(norm);
            }
        }

        return (titles, lastTocPage);
    }

    private static string LeadingText(PdfDocument document, int page)
    {
        try
        {
            var elements = PdfPageTextExtractor.ExtractPage(document.GetPage(page));
            return elements.Count > 0 ? Normalize(elements[0].Text) : string.Empty;
        }
        catch
        {
            return string.Empty;
        }
    }

    private static string Normalize(string? text)
        => string.IsNullOrWhiteSpace(text)
            ? string.Empty
            : Regex.Replace(text, @"\s+", " ").Trim();

    // Presentational title: normalize whitespace, then convert SCREAMING CAPS to
    // Title Case so the reader/slug read cleanly ("1. URGENT AND EMERGENT EYE
    // CARE" → "1. Urgent and Emergent Eye Care"). Mixed-case titles are left as-is.
    private static string CleanTitle(string raw)
    {
        var s = Normalize(raw);
        var letters = s.Where(char.IsLetter).ToList();
        var isAllCaps = letters.Count > 0 && letters.All(char.IsUpper);
        if (!isAllCaps)
            return s;

        var words = s.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        for (var i = 0; i < words.Length; i++)
            words[i] = TitleCaseWord(words[i], isFirst: i == 0);
        return string.Join(' ', words);
    }

    private static readonly HashSet<string> LowerWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on",
        "or", "the", "to", "vs", "with",
    };

    private static string TitleCaseWord(string word, bool isFirst)
    {
        if (word.Length == 0)
            return word;

        // Keep tokens that aren't alphabetic (numbers, "1.", "&", "II.") verbatim.
        if (!word.Any(char.IsLetter))
            return word;

        // Preserve roman-numeral part markers ("II.", "IV") in caps.
        var core = word.TrimEnd('.');
        if (core.Length > 0 && core.All(c => "IVXLCDM".Contains(c)))
            return word;

        var lower = word.ToLowerInvariant();
        if (!isFirst && LowerWords.Contains(core))
            return lower;

        // Title-case the first letter of the first alphabetic run; keep internal
        // structure ("CONJUNCTIVAL/CORNEAL" → "Conjunctival/Corneal").
        var chars = lower.ToCharArray();
        var atWordStart = true;
        for (var i = 0; i < chars.Length; i++)
        {
            if (char.IsLetter(chars[i]))
            {
                if (atWordStart)
                    chars[i] = char.ToUpperInvariant(chars[i]);
                atWordStart = false;
            }
            else if (chars[i] is '/' or '-' or '(')
            {
                atWordStart = true;
            }
        }
        return new string(chars);
    }
}
