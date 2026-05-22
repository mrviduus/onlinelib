using System.Text.RegularExpressions;
using HtmlAgilityPack;

namespace TextStack.Extraction.Quality;

/// <summary>
/// Scores extracted chapter HTML for the structural defects typical of PDF
/// extraction (see <see cref="ContentQualityIssue"/>). Pure, deterministic,
/// no I/O — the gate that decides which chapters are worth an LLM cleanup pass.
///
/// Score starts at 100; each detected defect subtracts a frequency-scaled
/// penalty. A defect is only reported once it crosses a floor, so trivial
/// one-off noise doesn't flag an otherwise-clean chapter.
/// </summary>
public static class ChapterContentQualityAnalyzer
{
    // Fragment-fraction is only meaningful once a chapter has enough paragraphs.
    private const int MinParagraphsForFragmentCheck = 4;

    // Compiled, not [GeneratedRegex] — ARM64 SIGILL bug (see Extraction/RULES.md).
    private static readonly Regex PageNumberOnly =
        new(@"^\s*\d{1,4}\s*$", RegexOptions.Compiled);
    private static readonly Regex RunningHeaderPipe =
        new(@"(^\s*\d{1,4}\s*\|)|(\|\s*\d{1,4}\s*$)", RegexOptions.Compiled);
    private static readonly Regex HyphenArtifact =
        new(@"\p{L}[‐­‑] \p{Ll}", RegexOptions.Compiled);
    private static readonly Regex FootnoteStart =
        new(@"^\s*\d{1,3}\s+\p{Lu}", RegexOptions.Compiled);
    private static readonly Regex Whitespace =
        new(@"\s+", RegexOptions.Compiled);

    private static readonly HashSet<string> NoiseGlyphs =
        new(StringComparer.Ordinal) { "|", "•", "·", "*", "■", "□", "—", "–" };

    public static ContentQualityReport Analyze(string? html)
    {
        if (string.IsNullOrWhiteSpace(html))
            return ContentQualityReport.Clean;

        var doc = new HtmlDocument();
        doc.LoadHtml(html);

        var paragraphs = (doc.DocumentNode.SelectNodes("//p") ?? Enumerable.Empty<HtmlNode>())
            .Select(p => NormalizeText(p.InnerText))
            .Where(t => t.Length > 0)
            .ToList();

        if (paragraphs.Count == 0)
            return ContentQualityReport.Clean;

        var issues = new List<ContentQualityIssue>();
        var penalty = 0;

        penalty += ScoreFragments(paragraphs, issues);
        penalty += ScoreRunningHeaders(paragraphs, issues);
        penalty += ScoreHyphenation(paragraphs, issues);
        penalty += ScoreOrphanNumbers(paragraphs, issues);
        penalty += ScoreFootnotes(paragraphs, issues);

        return new ContentQualityReport(Math.Clamp(100 - penalty, 0, 100), issues);
    }

    // ── Detectors ──────────────────────────────────────────────────────────
    // Each returns a penalty (0 = nothing wrong) and appends its issue code
    // when the defect is real, not incidental.

    private static int ScoreFragments(List<string> paragraphs, List<ContentQualityIssue> issues)
    {
        if (paragraphs.Count < MinParagraphsForFragmentCheck)
            return 0;

        var fragments = paragraphs.Count(IsFragment);
        var fraction = (double)fragments / paragraphs.Count;

        // Real signal: ≥12% of paragraphs are fragments, or ≥8 of them outright.
        if (fraction < 0.12 && fragments < 8)
            return 0;

        issues.Add(ContentQualityIssue.FragmentedParagraphs);
        return (int)Math.Min(60, fraction * 150);
    }

    private static int ScoreRunningHeaders(List<string> paragraphs, List<ContentQualityIssue> issues)
    {
        var pipeHeaders = paragraphs.Count(p => RunningHeaderPipe.IsMatch(p));

        // Identical short paragraphs repeating within one chapter = leaked chrome.
        var repeats = paragraphs
            .Where(p => p.Length <= 100)
            .GroupBy(p => p, StringComparer.Ordinal)
            .Where(g => g.Count() >= 2)
            .Sum(g => g.Count() - 1);

        var count = pipeHeaders + repeats;
        if (count < 2)
            return 0;

        issues.Add(ContentQualityIssue.RunningHeaderInBody);
        return Math.Min(25, count * 7);
    }

    private static int ScoreHyphenation(List<string> paragraphs, List<ContentQualityIssue> issues)
    {
        var count = paragraphs.Sum(p => HyphenArtifact.Matches(p).Count);
        if (count < 3)
            return 0;

        issues.Add(ContentQualityIssue.HyphenationArtifacts);
        return Math.Min(20, count * 2);
    }

    private static int ScoreOrphanNumbers(List<string> paragraphs, List<ContentQualityIssue> issues)
    {
        var count = paragraphs.Count(IsOrphanNumberOrGlyph);
        if (count < 2)
            return 0;

        issues.Add(ContentQualityIssue.OrphanPageNumbers);
        return Math.Min(15, count * 5);
    }

    private static int ScoreFootnotes(List<string> paragraphs, List<ContentQualityIssue> issues)
    {
        var count = paragraphs.Count(p => FootnoteStart.IsMatch(p));
        if (count < 3)
            return 0;

        issues.Add(ContentQualityIssue.SuspectedFootnotes);
        return Math.Min(10, count * 2);
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    /// <summary>A stray ≤2-word paragraph that doesn't end a sentence.</summary>
    private static bool IsFragment(string text)
    {
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (words.Length > 2)
            return false;
        var last = text[^1];
        return last is not ('.' or '!' or '?' or '…' or ':' or ';');
    }

    private static bool IsOrphanNumberOrGlyph(string text)
        => PageNumberOnly.IsMatch(text)
           || (text.Length <= 2 && NoiseGlyphs.Contains(text));

    /// <summary>De-entitize, collapse whitespace, trim.</summary>
    private static string NormalizeText(string raw)
        => Whitespace.Replace(HtmlEntity.DeEntitize(raw) ?? string.Empty, " ").Trim();
}
