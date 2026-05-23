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

    // --- LooksLikeTableOfContentsBody ---

    [Fact]
    public void LooksLikeTableOfContentsBody_LeaderDottedEntries_MatchEvenWithoutTitle()
    {
        var tocText = string.Join('\n', new[]
        {
            "Preface ............ xi",
            "Chapter 1 Introduction .......... 1",
            "Chapter 2 Foundation Models ..... 49",
            "Chapter 3 Evaluation ............ 111",
            "Chapter 4 Inference ............. 145",
            "Chapter 5 Production ............ 193",
            "Index ........................... 271",
        });

        Assert.True(FrontMatterFilter.LooksLikeTableOfContentsBody(tocText));
    }

    [Fact]
    public void LooksLikeTableOfContentsBody_EllipsisLeader_IsDetected()
    {
        var tocText = string.Join('\n', new[]
        {
            "Preface … xi",
            "Chapter 1 Introduction … 1",
            "Chapter 2 Foundation Models … 49",
            "Chapter 3 Evaluation … 111",
            "Chapter 4 Inference … 145",
        });

        Assert.True(FrontMatterFilter.LooksLikeTableOfContentsBody(tocText));
    }

    [Fact]
    public void LooksLikeTableOfContentsBody_PlainProse_DoesNotMatch()
    {
        var proseText = string.Join('\n', new[]
        {
            "This book is geared toward technical roles.",
            "It is for AI engineers, ML engineers, data scientists, and others.",
            "You can also benefit if you work in tool development.",
            "We will cover use cases, evaluation, and production deployment.",
            "Reading this front matter gives you the lay of the land.",
            "Each chapter ends with summaries and references for further study.",
        });

        Assert.False(FrontMatterFilter.LooksLikeTableOfContentsBody(proseText));
    }

    [Fact]
    public void LooksLikeTableOfContentsBody_TooShort_DoesNotMatch()
    {
        // Conservative: under 5 substantive lines we abstain rather than risk
        // dropping a real short chapter that happens to end with a page-number.
        var tooShort = "Preface ............ xi\nChapter 1 .......... 1";
        Assert.False(FrontMatterFilter.LooksLikeTableOfContentsBody(tooShort));
    }

    [Fact]
    public void LooksLikeTableOfContentsBody_NullOrEmpty_DoesNotMatch()
    {
        Assert.False(FrontMatterFilter.LooksLikeTableOfContentsBody(null));
        Assert.False(FrontMatterFilter.LooksLikeTableOfContentsBody(""));
        Assert.False(FrontMatterFilter.LooksLikeTableOfContentsBody("    "));
    }
}
