using System.Text;
using System.Text.RegularExpressions;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.DocumentLayoutAnalysis.WordExtractor;

namespace TextStack.Extraction.Extractors.Pdf;

/// <summary>
/// Extracts structured text (paragraphs, headings, bold/italic) from a single PDF page.
/// Groups all page words by Y → lines → paragraphs. Merges hyphenated line breaks.
/// XYCut intentionally dropped: it fragments sparse layouts (chapter intro spreads,
/// pull quotes) into one-word-per-block. Most books are single column.
/// </summary>
public static class PdfPageTextExtractor
{
    private const double LineYTolerance = 3.0;
    private const double ParagraphGapMultiplier = 1.5;
    private const double HeadingFontRatio = 0.9;
    private const double MinHeadingFontDifference = 1.5;
    private const int MaxHeadingTextLength = 200;

    // Single-char dividers / bullets that show up as artifacts when nginx/header
    // glyphs leak into the body. "|" between page number and running title is common.
    private static readonly HashSet<string> NoisePunctuation = new(StringComparer.Ordinal)
    {
        "|", "•", "·", "—", "-", "–", "*", "■", "□", "○", "●", "▪", "▫"
    };

    private static readonly Regex PageNumberPattern = new(@"^\d{1,4}$", RegexOptions.Compiled);

    // Running headers from O'Reilly-style tech books take the shape
    //   "4 | Chapter 1: Introduction to Building AI Applications…"
    //   "The Rise of AI Engineering | 3"
    // The page number varies per page, so the cross-page (identical-text)
    // filter in PdfTextExtractor can't catch them — but the structural
    // signature (small int + " | " + text, on a short paragraph) is
    // distinctive. Encoded here from a Claude cleanup pair (slice 5 r1).
    private const int RunningHeaderMaxLength = 200;
    private static readonly Regex RunningHeaderLike = new(
        @"^(?:\d{1,4}\s*\|\s*\S.+|\S.+\s*\|\s*\d{1,4})$",
        RegexOptions.Compiled);

    public static List<PdfTextElement> ExtractPage(Page page)
    {
        var words = page.GetWords(NearestNeighbourWordExtractor.Instance).ToList();
        if (words.Count == 0)
            return [];

        var allFontSizes = words
            .SelectMany(w => w.Letters)
            .Select(l => l.FontSize)
            .ToList();
        var maxFontSize = allFontSizes.Count > 0 ? allFontSizes.Max() : 0;
        var avgFontSizeAll = allFontSizes.Count > 0 ? allFontSizes.Average() : 0;
        var hasDistinctHeadingFont = maxFontSize - avgFontSizeAll >= MinHeadingFontDifference;
        var headingThreshold = maxFontSize * HeadingFontRatio;

        var lines = GroupWordsIntoLines(words);
        var paragraphs = GroupLinesIntoParagraphs(lines);

        var elements = new List<PdfTextElement>();

        foreach (var paragraph in paragraphs)
        {
            var allWords = paragraph.SelectMany(l => l).ToList();
            if (allWords.Count == 0)
                continue;

            var text = BuildParagraphText(paragraph);
            if (string.IsNullOrWhiteSpace(text))
                continue;

            if (IsArtifactNoise(text))
                continue;

            var fontName = GetDominantFontName(allWords);
            var isBold = fontName.Contains("Bold", StringComparison.OrdinalIgnoreCase);
            var isItalic = fontName.Contains("Italic", StringComparison.OrdinalIgnoreCase)
                           || fontName.Contains("Oblique", StringComparison.OrdinalIgnoreCase);

            var avgFontSize = allWords
                .SelectMany(w => w.Letters)
                .Select(l => l.FontSize)
                .DefaultIfEmpty(0)
                .Average();

            var isHeading = hasDistinctHeadingFont
                            && avgFontSize >= headingThreshold
                            && text.Length < MaxHeadingTextLength;

            var yPosition = allWords
                .Select(w => w.BoundingBox.Bottom)
                .Average();

            elements.Add(new PdfTextElement(
                isHeading ? TextElementType.Heading : TextElementType.Paragraph,
                text,
                isBold,
                isItalic,
                yPosition));
        }

        return elements;
    }

    /// <summary>
    /// Joins words within a paragraph with spaces, but glues line-final hyphens
    /// to the next line's first word ("chal-" + "lenges" → "challenges").
    /// </summary>
    private static string BuildParagraphText(List<List<Word>> paragraph)
    {
        var sb = new StringBuilder();
        for (var i = 0; i < paragraph.Count; i++)
        {
            var lineWords = paragraph[i];
            if (lineWords.Count == 0)
                continue;

            for (var j = 0; j < lineWords.Count; j++)
            {
                var w = lineWords[j];
                var isLastWordOfLine = j == lineWords.Count - 1;
                var isLastLine = i == paragraph.Count - 1;

                if (isLastWordOfLine && !isLastLine && EndsWithSoftHyphen(w.Text))
                {
                    // Drop trailing hyphen; next line's first word joins without space.
                    sb.Append(w.Text.AsSpan(0, w.Text.Length - 1));
                    // No separator — let next iteration append immediately.
                }
                else
                {
                    sb.Append(w.Text);
                    if (j < lineWords.Count - 1)
                        sb.Append(' ');
                    else if (!isLastLine)
                        sb.Append(' ');
                }
            }
        }
        return sb.ToString().Trim();
    }

    private static bool EndsWithSoftHyphen(string text)
    {
        if (string.IsNullOrEmpty(text)) return false;
        var last = text[^1];
        // ASCII hyphen, Unicode hyphen U+2010, soft hyphen U+00AD, non-breaking hyphen U+2011.
        return last == '-' || last == '‐' || last == '­' || last == '‑';
    }

    /// <summary>
    /// True for short fragments that are page numbers, single dividers, pure
    /// punctuation noise, or O'Reilly-style running headers — all chrome that
    /// belongs at the page margin, not in the body.
    /// </summary>
    internal static bool IsArtifactNoise(string text)
    {
        var trimmed = text.Trim();
        if (trimmed.Length == 0) return true;
        if (trimmed.Length <= 2 && NoisePunctuation.Contains(trimmed)) return true;
        if (PageNumberPattern.IsMatch(trimmed)) return true;
        if (trimmed.Length <= RunningHeaderMaxLength && RunningHeaderLike.IsMatch(trimmed)) return true;
        return false;
    }

    private static List<List<Word>> GroupWordsIntoLines(List<Word> words)
    {
        if (words.Count == 0)
            return [];

        var sorted = words.OrderByDescending(w => w.BoundingBox.Bottom).ThenBy(w => w.BoundingBox.Left).ToList();

        var lines = new List<List<Word>>();
        var currentLine = new List<Word> { sorted[0] };
        var currentY = sorted[0].BoundingBox.Bottom;

        for (var i = 1; i < sorted.Count; i++)
        {
            var word = sorted[i];
            if (Math.Abs(word.BoundingBox.Bottom - currentY) <= LineYTolerance)
            {
                currentLine.Add(word);
            }
            else
            {
                lines.Add(currentLine.OrderBy(w => w.BoundingBox.Left).ToList());
                currentLine = [word];
                currentY = word.BoundingBox.Bottom;
            }
        }

        lines.Add(currentLine.OrderBy(w => w.BoundingBox.Left).ToList());
        return lines;
    }

    private static List<List<List<Word>>> GroupLinesIntoParagraphs(List<List<Word>> lines)
    {
        if (lines.Count == 0)
            return [];

        var lineHeights = new List<double>();
        for (var i = 1; i < lines.Count; i++)
        {
            var prevY = lines[i - 1].Average(w => w.BoundingBox.Bottom);
            var currY = lines[i].Average(w => w.BoundingBox.Bottom);
            var gap = Math.Abs(prevY - currY);
            if (gap > 0)
                lineHeights.Add(gap);
        }

        var avgLineHeight = lineHeights.Count > 0 ? lineHeights.Average() : 12.0;
        var paragraphGapThreshold = avgLineHeight * ParagraphGapMultiplier;

        var paragraphs = new List<List<List<Word>>>();
        var currentParagraph = new List<List<Word>> { lines[0] };

        for (var i = 1; i < lines.Count; i++)
        {
            var prevY = lines[i - 1].Average(w => w.BoundingBox.Bottom);
            var currY = lines[i].Average(w => w.BoundingBox.Bottom);
            var gap = Math.Abs(prevY - currY);

            if (gap > paragraphGapThreshold)
            {
                paragraphs.Add(currentParagraph);
                currentParagraph = [lines[i]];
            }
            else
            {
                currentParagraph.Add(lines[i]);
            }
        }

        paragraphs.Add(currentParagraph);
        return paragraphs;
    }

    private static string GetDominantFontName(List<Word> words)
    {
        var fontCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var word in words)
        {
            foreach (var letter in word.Letters)
            {
                var name = letter.FontName ?? "";
                fontCounts[name] = fontCounts.GetValueOrDefault(name) + 1;
            }
        }

        return fontCounts.Count > 0
            ? fontCounts.MaxBy(kv => kv.Value).Key
            : "";
    }
}
