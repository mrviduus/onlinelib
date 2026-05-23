using TextStack.Extraction.Extractors.Pdf;

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
}
