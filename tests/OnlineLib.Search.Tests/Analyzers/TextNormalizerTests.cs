using OnlineLib.Search.Analyzers;

namespace OnlineLib.Search.Tests.Analyzers;

public class TextNormalizerTests
{
    #region Normalize Tests

    [Fact]
    public void Normalize_SimpleText_ReturnsLowercase()
    {
        var result = TextNormalizer.Normalize("HELLO World");

        Assert.Equal("hello world", result);
    }

    [Fact]
    public void Normalize_ExtraWhitespace_CollapsesToSingleSpace()
    {
        var result = TextNormalizer.Normalize("  hello    world  ");

        Assert.Equal("hello world", result);
    }

    [Fact]
    public void Normalize_EmptyString_ReturnsEmpty()
    {
        var result = TextNormalizer.Normalize("");

        Assert.Equal(string.Empty, result);
    }

    [Fact]
    public void Normalize_Null_ReturnsEmpty()
    {
        var result = TextNormalizer.Normalize(null!);

        Assert.Equal(string.Empty, result);
    }

    [Fact]
    public void Normalize_WhitespaceOnly_ReturnsEmpty()
    {
        var result = TextNormalizer.Normalize("   ");

        Assert.Equal(string.Empty, result);
    }

    #endregion

    #region StripHtml Tests

    [Fact]
    public void StripHtml_SimpleParagraph_ReturnsText()
    {
        var result = TextNormalizer.StripHtml("<p>Hello World</p>");

        Assert.Equal("Hello World", result);
    }

    [Fact]
    public void StripHtml_NestedTags_ReturnsText()
    {
        var result = TextNormalizer.StripHtml("<div><p><strong>Bold</strong> text</p></div>");

        Assert.Equal("Bold text", result);
    }

    [Fact]
    public void StripHtml_ScriptTag_RemovesEntireScript()
    {
        var result = TextNormalizer.StripHtml("<p>Hello</p><script>alert('xss')</script><p>World</p>");

        Assert.Equal("Hello World", result);
    }

    [Fact]
    public void StripHtml_StyleTag_RemovesEntireStyle()
    {
        var result = TextNormalizer.StripHtml("<style>.red{color:red}</style><p>Hello</p>");

        Assert.Equal("Hello", result);
    }

    [Fact]
    public void StripHtml_BlockElements_AddsSpaces()
    {
        var result = TextNormalizer.StripHtml("<p>First</p><p>Second</p>");

        Assert.Equal("First Second", result);
    }

    [Fact]
    public void StripHtml_HtmlEntities_DecodesCommon()
    {
        var result = TextNormalizer.StripHtml("<p>Hello&nbsp;World &amp; More</p>");

        Assert.Equal("Hello World & More", result);
    }

    [Fact]
    public void StripHtml_EmptyString_ReturnsEmpty()
    {
        var result = TextNormalizer.StripHtml("");

        Assert.Equal(string.Empty, result);
    }

    [Fact]
    public void StripHtml_Null_ReturnsEmpty()
    {
        var result = TextNormalizer.StripHtml(null!);

        Assert.Equal(string.Empty, result);
    }

    #endregion

    #region RemoveDiacritics Tests

    [Fact]
    public void RemoveDiacritics_AccentedChars_RemovesAccents()
    {
        var result = TextNormalizer.RemoveDiacritics("café résumé");

        Assert.Equal("cafe resume", result);
    }

    [Fact]
    public void RemoveDiacritics_NoAccents_ReturnsSame()
    {
        var result = TextNormalizer.RemoveDiacritics("hello world");

        Assert.Equal("hello world", result);
    }

    [Fact]
    public void RemoveDiacritics_Cyrillic_PreservesCyrillic()
    {
        var result = TextNormalizer.RemoveDiacritics("привіт світ");

        Assert.Equal("привіт світ", result);
    }

    #endregion

    #region Tokenize Tests

    [Fact]
    public void Tokenize_SimpleText_SplitsBySpace()
    {
        var result = TextNormalizer.Tokenize("hello world test");

        Assert.Equal(3, result.Count);
        Assert.Equal("hello", result[0]);
        Assert.Equal("world", result[1]);
        Assert.Equal("test", result[2]);
    }

    [Fact]
    public void Tokenize_ExtraSpaces_FiltersEmpty()
    {
        var result = TextNormalizer.Tokenize("hello   world");

        Assert.Equal(2, result.Count);
    }

    [Fact]
    public void Tokenize_EmptyString_ReturnsEmpty()
    {
        var result = TextNormalizer.Tokenize("");

        Assert.Empty(result);
    }

    #endregion

    #region CollapseWhitespace Tests

    [Fact]
    public void CollapseWhitespace_MultipleSpaces_CollapsesToOne()
    {
        var result = TextNormalizer.CollapseWhitespace("hello    world");

        Assert.Equal("hello world", result);
    }

    [Fact]
    public void CollapseWhitespace_TabsAndNewlines_CollapsesToSpace()
    {
        var result = TextNormalizer.CollapseWhitespace("hello\t\nworld");

        Assert.Equal("hello world", result);
    }

    #endregion
}
