using TextStack.Extraction.Extractors.Pdf;

namespace TextStack.Extraction.Tests;

/// <summary>
/// Ratchet round 1 (feat-0007 slice 5). Encodes recurring fix patterns
/// observed in Claude cleanup pairs into deterministic filters.
/// </summary>
public class RunningHeaderFilterTests
{
    [Theory]
    // O'Reilly running headers — page number on either side of " | ".
    [InlineData("4 | Chapter 1: Introduction to Building AI Applications with Foundation Models")]
    [InlineData("2 | Chapter 1: Introduction to Building AI Applications")]
    [InlineData("The Rise of AI Engineering | 3")]
    [InlineData("The Rise of AI Engineering | 5")]
    [InlineData("Foundation Model Use Cases | 17")]
    public void IsArtifactNoise_RunningHeaderWithPipeAndPageNumber_Filtered(string text)
    {
        Assert.True(PdfPageTextExtractor.IsArtifactNoise(text));
    }

    [Theory]
    // Earlier defects the filter already caught — confirm regression-free.
    [InlineData("4")]            // bare page number
    [InlineData("|")]            // divider glyph
    [InlineData("")]             // empty
    public void IsArtifactNoise_LegacyArtifacts_StillFiltered(string text)
    {
        Assert.True(PdfPageTextExtractor.IsArtifactNoise(text));
    }

    [Theory]
    // Real body content that happens to contain digits or pipes — must NOT match.
    [InlineData("Foundation models emerged from large language models, which in turn originated as language models.")]
    [InlineData("The Mixtral 8x7B model has a vocabulary size of 32,000.")]
    [InlineData("Section 1.1 covers the basics — see also chapter 4 for details.")]
    [InlineData("GPT-4 was released in March 2023.")]
    public void IsArtifactNoise_BodyProse_NotFiltered(string text)
    {
        Assert.False(PdfPageTextExtractor.IsArtifactNoise(text));
    }

    [Fact]
    public void IsArtifactNoise_LongRunningHeaderLike_NotFiltered()
    {
        // > 200 chars — even with the running-header signature, too long to be chrome.
        var text = "9 | " + new string('a', 250);
        Assert.False(PdfPageTextExtractor.IsArtifactNoise(text));
    }
}
