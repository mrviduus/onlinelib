using TextStack.Extraction.Extractors;

namespace TextStack.Extraction.Tests;

public class FrontMatterFilterTests
{
    [Theory]
    [InlineData("Table of Contents")]
    [InlineData("table of contents")]
    [InlineData("TABLE OF CONTENTS")]
    [InlineData("Contents")]
    [InlineData("CONTENTS")]
    [InlineData("TOC")]
    [InlineData("Оглавление")]
    [InlineData("Содержание")]
    [InlineData("Зміст")]
    [InlineData("  Contents  ")]
    [InlineData("Contents 5")]   // bookmark sometimes carries a page ref
    [InlineData("Table of Contents 7")]
    public void IsTableOfContents_Matches_KnownTocTitles(string title)
    {
        Assert.True(FrontMatterFilter.IsTableOfContents(title));
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("Chapter 1")]
    [InlineData("Introduction")]
    [InlineData("Acknowledgments")]
    [InlineData("Index")]
    [InlineData("Bibliography")]
    [InlineData("Glossary")]
    // "Discontent" contains "content" as substring — anchors must reject this.
    [InlineData("Discontent")]
    [InlineData("Table Setting")]
    public void IsTableOfContents_DoesNotMatch_OtherTitles(string? title)
    {
        Assert.False(FrontMatterFilter.IsTableOfContents(title));
    }
}
