using Domain.Utilities;

namespace OnlineLib.UnitTests;

public class SlugGeneratorTests
{
    [Theory]
    [InlineData("The Great Gatsby", "the-great-gatsby")]
    [InlineData("Frankenstein", "frankenstein")]
    [InlineData("War and Peace", "war-and-peace")]
    public void GenerateSlug_SimpleTitle_ReturnsExpected(string title, string expected)
    {
        Assert.Equal(expected, SlugGenerator.GenerateSlug(title));
    }

    [Theory]
    [InlineData("It's a Test", "its-a-test")]
    [InlineData("\"Quoted Title\"", "quoted-title")]
    [InlineData("Title: Subtitle", "title-subtitle")]
    [InlineData("Title; Part 2", "title-part-2")]
    [InlineData("Mr. Smith", "mr-smith")]
    [InlineData("Hello, World", "hello-world")]
    public void GenerateSlug_WithPunctuation_RemovesPunctuation(string title, string expected)
    {
        Assert.Equal(expected, SlugGenerator.GenerateSlug(title));
    }

    [Theory]
    [InlineData("  Spaces  Around  ", "spaces-around")]
    [InlineData("Multiple   Spaces", "multiple-spaces")]
    [InlineData("---Dashes---", "dashes")]
    public void GenerateSlug_WithExtraSpaces_CollapsesDashes(string title, string expected)
    {
        Assert.Equal(expected, SlugGenerator.GenerateSlug(title));
    }

    [Theory]
    [InlineData("", "")]
    [InlineData("   ", "")]
    public void GenerateSlug_EmptyOrWhitespace_ReturnsEmpty(string title, string expected)
    {
        Assert.Equal(expected, SlugGenerator.GenerateSlug(title));
    }

    [Fact]
    public void GenerateSlug_NeverContainsDoubleDashes()
    {
        var result = SlugGenerator.GenerateSlug("Pride & Prejudice");
        Assert.DoesNotContain("--", result);
    }

    [Theory]
    [InlineData("Chapter 1", 0, "chapter-1")]
    [InlineData("Chapter 2", 1, "chapter-2")]
    [InlineData("Letter 4", 3, "letter-4")]
    [InlineData("CONTENTS", 0, "contents")]
    [InlineData("Preface", 0, "preface")]
    [InlineData("Introduction", 0, "introduction")]
    public void GenerateChapterSlug_FromTitle_ReturnsExpected(string title, int order, string expected)
    {
        Assert.Equal(expected, SlugGenerator.GenerateChapterSlug(title, order));
    }

    [Theory]
    [InlineData("", 0, "section-1")]
    [InlineData("   ", 0, "section-1")]
    [InlineData("", 4, "section-5")]
    [InlineData("X", 2, "section-3")] // Too short (length < 2)
    public void GenerateChapterSlug_EmptyOrShort_ReturnsSectionFallback(string title, int order, string expected)
    {
        Assert.Equal(expected, SlugGenerator.GenerateChapterSlug(title, order));
    }

    [Fact]
    public void GenerateChapterSlug_WithSpecialChars_CleansUp()
    {
        Assert.Equal("chapter-i-the-beginning", SlugGenerator.GenerateChapterSlug("Chapter I: The Beginning", 0));
    }
}
