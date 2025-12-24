using OnlineLib.Search.Providers.PostgresFts;

namespace OnlineLib.Search.Tests.Providers.PostgresFts;

public class PostgresHighlighterTests
{
    #region HighlightOptions Tests

    [Fact]
    public void HighlightOptions_Default_HasCorrectValues()
    {
        var options = HighlightOptions.Default;

        Assert.Equal("<b>", options.StartSel);
        Assert.Equal("</b>", options.StopSel);
        Assert.Equal(3, options.MaxFragments);
        Assert.Equal(35, options.MaxWords);
        Assert.Equal(15, options.MinWords);
        Assert.Equal(" ... ", options.FragmentDelimiter);
    }

    [Fact]
    public void HighlightOptions_ToOptionsString_ContainsAllOptions()
    {
        var options = new HighlightOptions
        {
            StartSel = "<mark>",
            StopSel = "</mark>",
            MaxFragments = 5,
            MaxWords = 50,
            MinWords = 10,
            FragmentDelimiter = "..."
        };

        var result = options.ToOptionsString();

        Assert.Contains("StartSel=<mark>", result);
        Assert.Contains("StopSel=</mark>", result);
        Assert.Contains("MaxFragments=5", result);
        Assert.Contains("MaxWords=50", result);
        Assert.Contains("MinWords=10", result);
        Assert.Contains("FragmentDelimiter=...", result);
    }

    #endregion

    #region ParseTsHeadlineResult Tests

    [Fact]
    public void ParseTsHeadlineResult_SingleFragment_ReturnsOneFragment()
    {
        var headline = "This is a <b>test</b> fragment";

        var result = PostgresHighlighter.ParseTsHeadlineResult(headline, "content");

        Assert.Equal("content", result.Field);
        Assert.Single(result.Fragments);
        Assert.Equal("This is a <b>test</b> fragment", result.Fragments[0]);
    }

    [Fact]
    public void ParseTsHeadlineResult_MultipleFragments_SplitsByDelimiter()
    {
        var headline = "First <b>match</b> here ... Second <b>match</b> there ... Third <b>match</b>";

        var result = PostgresHighlighter.ParseTsHeadlineResult(headline, "content");

        Assert.Equal(3, result.Fragments.Count);
        Assert.Equal("First <b>match</b> here", result.Fragments[0]);
        Assert.Equal("Second <b>match</b> there", result.Fragments[1]);
        Assert.Equal("Third <b>match</b>", result.Fragments[2]);
    }

    [Fact]
    public void ParseTsHeadlineResult_EmptyHeadline_ReturnsEmptyFragments()
    {
        var result = PostgresHighlighter.ParseTsHeadlineResult("", "content");

        Assert.Empty(result.Fragments);
    }

    [Fact]
    public void ParseTsHeadlineResult_NullHeadline_ReturnsEmptyFragments()
    {
        var result = PostgresHighlighter.ParseTsHeadlineResult(null, "content");

        Assert.Empty(result.Fragments);
    }

    [Fact]
    public void ParseTsHeadlineResult_CustomDelimiter_SplitsCorrectly()
    {
        var headline = "First match|||Second match|||Third match";

        var result = PostgresHighlighter.ParseTsHeadlineResult(headline, "content", "|||");

        Assert.Equal(3, result.Fragments.Count);
    }

    #endregion

    #region BuildTsHeadlineSql Tests

    [Fact]
    public void BuildTsHeadlineSql_DefaultOptions_ReturnsValidSql()
    {
        var sql = PostgresHighlighter.BuildTsHeadlineSql("@FtsConfig", "c.plain_text", "to_tsquery(@FtsConfig, @Query)");

        Assert.Contains("ts_headline(@FtsConfig, c.plain_text, to_tsquery(@FtsConfig, @Query)", sql);
        Assert.Contains("StartSel=<b>", sql);
        Assert.Contains("StopSel=</b>", sql);
    }

    [Fact]
    public void BuildTsHeadlineSql_CustomOptions_ReturnsCustomSql()
    {
        var options = new HighlightOptions { StartSel = "<em>", StopSel = "</em>" };

        var sql = PostgresHighlighter.BuildTsHeadlineSql("'english'", "content", "query", options);

        Assert.Contains("StartSel=<em>", sql);
        Assert.Contains("StopSel=</em>", sql);
    }

    #endregion

    #region GetHighlights In-Memory Fallback Tests

    [Fact]
    public void GetHighlights_EmptyContent_ReturnsEmpty()
    {
        var highlighter = new PostgresHighlighter();

        var result = highlighter.GetHighlights("", "test");

        Assert.Empty(result);
    }

    [Fact]
    public void GetHighlights_EmptyQuery_ReturnsEmpty()
    {
        var highlighter = new PostgresHighlighter();

        var result = highlighter.GetHighlights("Some content here", "");

        Assert.Empty(result);
    }

    [Fact]
    public void GetHighlights_MatchingTerm_ReturnsHighlight()
    {
        var highlighter = new PostgresHighlighter();
        var content = "This is a test of the highlighting system for search results";

        var result = highlighter.GetHighlights(content, "test");

        Assert.Single(result);
        Assert.Equal("content", result[0].Field);
        Assert.NotEmpty(result[0].Fragments);
    }

    [Fact]
    public void GetHighlights_NoMatch_ReturnsEmpty()
    {
        var highlighter = new PostgresHighlighter();
        var content = "This is some content without the search term";

        var result = highlighter.GetHighlights(content, "xyz123");

        Assert.Empty(result);
    }

    #endregion
}
