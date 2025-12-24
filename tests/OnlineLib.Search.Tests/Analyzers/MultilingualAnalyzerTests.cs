using OnlineLib.Search.Analyzers;
using OnlineLib.Search.Enums;

namespace OnlineLib.Search.Tests.Analyzers;

public class MultilingualAnalyzerTests
{
    private readonly MultilingualAnalyzer _analyzer = new();

    #region GetFtsConfig Tests

    [Theory]
    [InlineData(SearchLanguage.En, "english")]
    [InlineData(SearchLanguage.Uk, "simple")]
    [InlineData(SearchLanguage.Auto, "simple")]
    public void GetFtsConfig_ReturnsCorrectConfig(SearchLanguage language, string expected)
    {
        var result = _analyzer.GetFtsConfig(language);

        Assert.Equal(expected, result);
    }

    #endregion

    #region DetectFromCode Tests

    [Theory]
    [InlineData("en", SearchLanguage.En)]
    [InlineData("eng", SearchLanguage.En)]
    [InlineData("english", SearchLanguage.En)]
    [InlineData("EN", SearchLanguage.En)]
    [InlineData("uk", SearchLanguage.Uk)]
    [InlineData("ukr", SearchLanguage.Uk)]
    [InlineData("ukrainian", SearchLanguage.Uk)]
    [InlineData("UK", SearchLanguage.Uk)]
    public void DetectFromCode_KnownCodes_ReturnsCorrectLanguage(string code, SearchLanguage expected)
    {
        var result = MultilingualAnalyzer.DetectFromCode(code);

        Assert.Equal(expected, result);
    }

    [Theory]
    [InlineData("fr")]
    [InlineData("de")]
    [InlineData("unknown")]
    [InlineData("")]
    [InlineData(null)]
    public void DetectFromCode_UnknownOrEmpty_ReturnsAuto(string? code)
    {
        var result = MultilingualAnalyzer.DetectFromCode(code);

        Assert.Equal(SearchLanguage.Auto, result);
    }

    #endregion

    #region Normalize Tests

    [Fact]
    public void Normalize_DelegatesToTextNormalizer()
    {
        var result = _analyzer.Normalize("HELLO World");

        Assert.Equal("hello world", result);
    }

    #endregion

    #region Tokenize Tests

    [Fact]
    public void Tokenize_DelegatesToTextNormalizer()
    {
        var result = _analyzer.Tokenize("hello world test");

        Assert.Equal(3, result.Count);
    }

    #endregion

    #region StripHtml Tests

    [Fact]
    public void StripHtml_DelegatesToTextNormalizer()
    {
        var result = _analyzer.StripHtml("<p>Hello</p>");

        Assert.Equal("Hello", result);
    }

    #endregion
}
