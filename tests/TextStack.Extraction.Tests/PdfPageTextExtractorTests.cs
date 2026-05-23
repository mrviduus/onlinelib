using TextStack.Extraction.Extractors.Pdf;
using TextStack.Extraction.Tests.Helpers;
using UglyToad.PdfPig;

namespace TextStack.Extraction.Tests;

public class PdfPageTextExtractorTests
{
    [Theory]
    [InlineData("•")]
    [InlineData("●")]
    [InlineData("▪")]
    [InlineData("◦")]
    [InlineData("○")]
    [InlineData("‣")]
    [InlineData("⁃")]
    [InlineData("•You're")]   // bullet glued to first word — still a list item
    public void IsBulletPrefix_RecognizesBulletGlyphs(string firstWord)
    {
        Assert.True(PdfPageTextExtractor.IsBulletPrefix(firstWord));
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("You're")]
    [InlineData("1.")]   // numbered list — left out on purpose, "." is too noisy as a trigger
    [InlineData("a)")]
    [InlineData("This")]
    public void IsBulletPrefix_RejectsNonBulletStarts(string? firstWord)
    {
        Assert.False(PdfPageTextExtractor.IsBulletPrefix(firstWord));
    }

    [Fact]
    public void StartsWithIndent_EmptyLine_ReturnsFalse()
    {
        // PdfPig Word objects can't be synthesized here without a backing
        // PdfDocument — the integration-level tests below cover the positive
        // case. This guards the documented behaviour for empty input.
        Assert.False(PdfPageTextExtractor.StartsWithIndent([], baseLeft: 72));
    }

    // Standard14 Helvetica word-spacing in PdfPig output is wider than ASCII
    // " " — words come out separated by multiple whitespace chars. Match on
    // content rather than exact whitespace so tests track intent, not the
    // PdfPig font quirk.
    private static string Normalize(string text) =>
        System.Text.RegularExpressions.Regex.Replace(text, @"\s+", " ").Trim();

    [Fact]
    public void ExtractPage_TwoParagraphsByVerticalGap_AreSplit()
    {
        // lineSpacing=14, paragraphSpacing=20 → ratio 1.43.
        // Median gap is 14; threshold = 14 × 1.2 = 16.8 → 20 > 16.8 → split.
        // The old mean+1.5 path computed mean≈15 (one 20 + four 14s),
        // threshold = 22.5, would NOT have split.
        var pdfBytes = PdfFixtureGenerator.GeneratePdfWithTwoParagraphs(
            lineSpacing: 14, paragraphSpacing: 20);
        using var doc = PdfDocument.Open(pdfBytes);
        var elements = PdfPageTextExtractor.ExtractPage(doc.GetPage(1));

        Assert.Equal(2, elements.Count);
        Assert.StartsWith("Paragraph A", Normalize(elements[0].Text));
        Assert.StartsWith("Paragraph B", Normalize(elements[1].Text));
    }

    [Fact]
    public void ExtractPage_IndentedFirstLine_StartsNewParagraph()
    {
        // All lines at line-spacing — no vertical signal at all.
        // Paragraph B's first line is shifted 12pt right (typical book indent).
        var pdfBytes = PdfFixtureGenerator.GeneratePdfWithIndentedParagraph(
            lineSpacing: 14, indent: 12);
        using var doc = PdfDocument.Open(pdfBytes);
        var elements = PdfPageTextExtractor.ExtractPage(doc.GetPage(1));

        Assert.True(elements.Count >= 2,
            $"expected ≥2 paragraphs, got {elements.Count}: " +
            string.Join(" | ", elements.Select(e => e.Text)));
        // Some paragraph must start with "Paragraph B" (the indented start).
        Assert.Contains(elements, e => Normalize(e.Text).StartsWith("Paragraph B"));
    }
}
