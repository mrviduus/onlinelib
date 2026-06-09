using TextStack.Extraction.Utilities;

namespace TextStack.Extraction.Tests;

public class HtmlCleanerTitleTests
{
    private const string BookTitlePollutedPage =
        "<html><head><title>The Charisma Myth</title></head><body><p>Difficult Situations FOR THE MOST part…</p></body></html>";

    [Fact]
    public void ExtractHeadingTitle_IgnoresHeadTitle_ReturnsNullWhenNoVisibleHeading()
    {
        // The bug: every spine file's <head><title> is the BOOK title, so using
        // it mislabeled chapters and blocked stub/body merges. Heading-only
        // extraction must NOT see it.
        Assert.Null(HtmlCleaner.ExtractHeadingTitle(BookTitlePollutedPage));
    }

    [Fact]
    public void ExtractTitle_StillFallsBackToHeadTitle_UnchangedForBookLevel()
    {
        // Contrast: book-level ExtractTitle keeps the <title> fallback (used by
        // other callers) — we only changed the per-chapter path.
        Assert.Equal("The Charisma Myth", HtmlCleaner.ExtractTitle(BookTitlePollutedPage));
    }

    [Theory]
    [InlineData("<h1>Difficult Situations</h1><p>body</p>", "Difficult Situations")]
    [InlineData("<h2>Presenting with Charisma</h2>", "Presenting with Charisma")]
    [InlineData("<h3>Notes</h3>", "Notes")]
    public void ExtractHeadingTitle_ReturnsVisibleHeading(string html, string expected)
    {
        Assert.Equal(expected, HtmlCleaner.ExtractHeadingTitle(html));
    }

    [Fact]
    public void ExtractHeadingTitle_PrefersH1OverDeeperHeadings()
    {
        var html = "<h1>Chapter</h1><h2>Subsection</h2>";
        Assert.Equal("Chapter", HtmlCleaner.ExtractHeadingTitle(html));
    }

    [Theory]
    [InlineData("<h1>Unknown</h1>")]
    [InlineData("<h1>Untitled</h1>")]
    public void ExtractHeadingTitle_RejectsPlaceholders(string html)
    {
        Assert.Null(HtmlCleaner.ExtractHeadingTitle(html));
    }
}
