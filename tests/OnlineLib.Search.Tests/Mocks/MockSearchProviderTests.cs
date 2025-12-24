using OnlineLib.Search.Contracts;
using OnlineLib.Search.Enums;

namespace OnlineLib.Search.Tests.Mocks;

public class MockSearchProviderTests
{
    #region SearchAsync Tests

    [Fact]
    public async Task SearchAsync_Default_ReturnsEmpty()
    {
        var mock = new MockSearchProvider();
        var request = new SearchRequest("test", Guid.NewGuid());

        var result = await mock.SearchAsync(request);

        Assert.Equal(SearchResult.Empty, result);
    }

    [Fact]
    public async Task SearchAsync_ConfiguredResult_ReturnsConfiguredResult()
    {
        var mock = new MockSearchProvider();
        var expectedHit = SearchHit.Create("1", 1.0);
        var expectedResult = SearchResult.FromHits([expectedHit], 1);
        mock.ReturnsSearchResult(expectedResult);

        var request = new SearchRequest("test", Guid.NewGuid());
        var result = await mock.SearchAsync(request);

        Assert.Equal(expectedResult, result);
        Assert.Single(result.Hits);
    }

    [Fact]
    public async Task SearchAsync_ConfiguredToThrow_ThrowsException()
    {
        var mock = new MockSearchProvider();
        mock.ThrowsOnSearch(new InvalidOperationException("Test error"));

        var request = new SearchRequest("test", Guid.NewGuid());

        await Assert.ThrowsAsync<InvalidOperationException>(() => mock.SearchAsync(request));
    }

    [Fact]
    public async Task SearchAsync_TracksCalls()
    {
        var mock = new MockSearchProvider();
        var siteId = Guid.NewGuid();
        var request1 = new SearchRequest("query1", siteId);
        var request2 = new SearchRequest("query2", siteId, SearchLanguage.En);

        await mock.SearchAsync(request1);
        await mock.SearchAsync(request2);

        Assert.Equal(2, mock.SearchCalls.Count);
        Assert.Equal("query1", mock.SearchCalls[0].Query);
        Assert.Equal("query2", mock.SearchCalls[1].Query);
        Assert.Equal(SearchLanguage.En, mock.SearchCalls[1].Language);
    }

    #endregion

    #region SuggestAsync Tests

    [Fact]
    public async Task SuggestAsync_Default_ReturnsEmpty()
    {
        var mock = new MockSearchProvider();

        var result = await mock.SuggestAsync("test", Guid.NewGuid());

        Assert.Empty(result);
    }

    [Fact]
    public async Task SuggestAsync_ConfiguredSuggestions_ReturnsConfigured()
    {
        var mock = new MockSearchProvider();
        mock.ReturnsSuggestions(
            new Suggestion("Test 1", "test-1", null, null, 1.0),
            new Suggestion("Test 2", "test-2", null, null, 0.8));

        var result = await mock.SuggestAsync("test", Guid.NewGuid());

        Assert.Equal(2, result.Count);
        Assert.Equal("Test 1", result[0].Text);
    }

    [Fact]
    public async Task SuggestAsync_ConfiguredToThrow_ThrowsException()
    {
        var mock = new MockSearchProvider();
        mock.ThrowsOnSuggest(new TimeoutException("Timeout"));

        await Assert.ThrowsAsync<TimeoutException>(() =>
            mock.SuggestAsync("test", Guid.NewGuid()));
    }

    [Fact]
    public async Task SuggestAsync_TracksCalls()
    {
        var mock = new MockSearchProvider();
        var siteId = Guid.NewGuid();

        await mock.SuggestAsync("pre", siteId, 5);
        await mock.SuggestAsync("prefix", siteId, 10);

        Assert.Equal(2, mock.SuggestCalls.Count);
        Assert.Equal("pre", mock.SuggestCalls[0].Prefix);
        Assert.Equal(5, mock.SuggestCalls[0].Limit);
        Assert.Equal("prefix", mock.SuggestCalls[1].Prefix);
    }

    #endregion

    #region Reset Tests

    [Fact]
    public async Task Reset_ClearsAllState()
    {
        var mock = new MockSearchProvider();
        mock.ReturnsSearchResult(SearchResult.FromHits([SearchHit.Create("1", 1.0)], 1));
        mock.ReturnsSuggestions(new Suggestion("Test", "test", null, null, 1.0));
        await mock.SearchAsync(new SearchRequest("test", Guid.NewGuid()));
        await mock.SuggestAsync("test", Guid.NewGuid());

        mock.Reset();

        var searchResult = await mock.SearchAsync(new SearchRequest("test", Guid.NewGuid()));
        var suggestions = await mock.SuggestAsync("test", Guid.NewGuid());

        Assert.Equal(SearchResult.Empty, searchResult);
        Assert.Empty(suggestions);
        Assert.Single(mock.SearchCalls); // Only the new call
        Assert.Single(mock.SuggestCalls);
    }

    #endregion

    #region Fluent API Tests

    [Fact]
    public void FluentApi_ReturnsSelf()
    {
        var mock = new MockSearchProvider();

        var result1 = mock.ReturnsSearchResult(SearchResult.Empty);
        var result2 = mock.ThrowsOnSearch(new Exception());
        var result3 = mock.ReturnsSuggestions();
        var result4 = mock.ThrowsOnSuggest(new Exception());

        Assert.Same(mock, result1);
        Assert.Same(mock, result2);
        Assert.Same(mock, result3);
        Assert.Same(mock, result4);
    }

    #endregion
}
