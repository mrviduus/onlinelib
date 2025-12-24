using OnlineLib.Search.Contracts;
using OnlineLib.Search.Enums;

namespace OnlineLib.Search.Tests.Mocks;

public class InMemorySearchProviderTests
{
    private readonly Guid _siteId = Guid.NewGuid();

    #region SearchAsync Tests

    [Fact]
    public async Task SearchAsync_EmptyIndex_ReturnsEmpty()
    {
        var provider = new InMemorySearchProvider();
        var request = new SearchRequest("test", _siteId);

        var result = await provider.SearchAsync(request);

        Assert.Equal(0, result.TotalCount);
        Assert.Empty(result.Hits);
    }

    [Fact]
    public async Task SearchAsync_MatchingDocument_ReturnsHit()
    {
        var provider = new InMemorySearchProvider();
        provider.AddDocument(IndexDocument.Create("1", "Test Title", "Test content here", SearchLanguage.En, _siteId));

        var request = new SearchRequest("test", _siteId);
        var result = await provider.SearchAsync(request);

        Assert.Equal(1, result.TotalCount);
        Assert.Single(result.Hits);
        Assert.Equal("1", result.Hits[0].DocumentId);
    }

    [Fact]
    public async Task SearchAsync_NoMatch_ReturnsEmpty()
    {
        var provider = new InMemorySearchProvider();
        provider.AddDocument(IndexDocument.Create("1", "Hello World", "Some content", SearchLanguage.En, _siteId));

        var request = new SearchRequest("xyz", _siteId);
        var result = await provider.SearchAsync(request);

        Assert.Equal(0, result.TotalCount);
    }

    [Fact]
    public async Task SearchAsync_FiltersBySiteId()
    {
        var provider = new InMemorySearchProvider();
        var otherSiteId = Guid.NewGuid();
        provider.AddDocument(IndexDocument.Create("1", "Test", "Content", SearchLanguage.En, _siteId));
        provider.AddDocument(IndexDocument.Create("2", "Test", "Content", SearchLanguage.En, otherSiteId));

        var request = new SearchRequest("test", _siteId);
        var result = await provider.SearchAsync(request);

        Assert.Equal(1, result.TotalCount);
        Assert.Equal("1", result.Hits[0].DocumentId);
    }

    [Fact]
    public async Task SearchAsync_TitleMatchScoresHigher()
    {
        var provider = new InMemorySearchProvider();
        provider.AddDocument(IndexDocument.Create("1", "Other", "test content", SearchLanguage.En, _siteId));
        provider.AddDocument(IndexDocument.Create("2", "Test Title", "other content", SearchLanguage.En, _siteId));

        var request = new SearchRequest("test", _siteId);
        var result = await provider.SearchAsync(request);

        Assert.Equal(2, result.TotalCount);
        Assert.Equal("2", result.Hits[0].DocumentId); // Title match first
    }

    [Fact]
    public async Task SearchAsync_Pagination_Works()
    {
        var provider = new InMemorySearchProvider();
        for (var i = 0; i < 10; i++)
        {
            provider.AddDocument(IndexDocument.Create($"{i}", $"Test {i}", "Content", SearchLanguage.En, _siteId));
        }

        var request = new SearchRequest("test", _siteId, Offset: 3, Limit: 2);
        var result = await provider.SearchAsync(request);

        Assert.Equal(10, result.TotalCount);
        Assert.Equal(2, result.Hits.Count);
    }

    [Fact]
    public async Task SearchAsync_WithHighlights_ReturnsHighlights()
    {
        var provider = new InMemorySearchProvider();
        provider.AddDocument(IndexDocument.Create("1", "Title", "This is test content with searchable text", SearchLanguage.En, _siteId));

        var request = new SearchRequest("test", _siteId, IncludeHighlights: true);
        var result = await provider.SearchAsync(request);

        Assert.Single(result.Hits);
        Assert.NotEmpty(result.Hits[0].Highlights);
        Assert.Contains("<b>", result.Hits[0].Highlights[0].Fragments[0]);
    }

    [Fact]
    public async Task SearchAsync_EmptyQuery_ReturnsEmpty()
    {
        var provider = new InMemorySearchProvider();
        provider.AddDocument(IndexDocument.Create("1", "Test", "Content", SearchLanguage.En, _siteId));

        var request = new SearchRequest("", _siteId);
        var result = await provider.SearchAsync(request);

        Assert.Equal(SearchResult.Empty, result);
    }

    #endregion

    #region SuggestAsync Tests

    [Fact]
    public async Task SuggestAsync_MatchingPrefix_ReturnsSuggestions()
    {
        var provider = new InMemorySearchProvider();
        provider.AddDocument(IndexDocument.Create("1", "Test Book", "Content", SearchLanguage.En, _siteId));
        provider.AddDocument(IndexDocument.Create("2", "Testing Guide", "Content", SearchLanguage.En, _siteId));

        var result = await provider.SuggestAsync("test", _siteId);

        Assert.Equal(2, result.Count);
    }

    [Fact]
    public async Task SuggestAsync_ShortPrefix_ReturnsEmpty()
    {
        var provider = new InMemorySearchProvider();
        provider.AddDocument(IndexDocument.Create("1", "Test", "Content", SearchLanguage.En, _siteId));

        var result = await provider.SuggestAsync("t", _siteId);

        Assert.Empty(result);
    }

    [Fact]
    public async Task SuggestAsync_NoMatch_ReturnsEmpty()
    {
        var provider = new InMemorySearchProvider();
        provider.AddDocument(IndexDocument.Create("1", "Hello", "Content", SearchLanguage.En, _siteId));

        var result = await provider.SuggestAsync("xyz", _siteId);

        Assert.Empty(result);
    }

    [Fact]
    public async Task SuggestAsync_FiltersBySiteId()
    {
        var provider = new InMemorySearchProvider();
        var otherSiteId = Guid.NewGuid();
        provider.AddDocument(IndexDocument.Create("1", "Test", "Content", SearchLanguage.En, _siteId));
        provider.AddDocument(IndexDocument.Create("2", "Test Other", "Content", SearchLanguage.En, otherSiteId));

        var result = await provider.SuggestAsync("test", _siteId);

        Assert.Single(result);
    }

    #endregion

    #region Document Management Tests

    [Fact]
    public void AddDocuments_IncrementsCount()
    {
        var provider = new InMemorySearchProvider();

        provider.AddDocuments(
            IndexDocument.Create("1", "A", "A", SearchLanguage.En, _siteId),
            IndexDocument.Create("2", "B", "B", SearchLanguage.En, _siteId));

        Assert.Equal(2, provider.DocumentCount);
    }

    [Fact]
    public void RemoveDocument_DecreasesCount()
    {
        var provider = new InMemorySearchProvider();
        provider.AddDocument(IndexDocument.Create("1", "Test", "Content", SearchLanguage.En, _siteId));

        var removed = provider.RemoveDocument("1");

        Assert.True(removed);
        Assert.Equal(0, provider.DocumentCount);
    }

    [Fact]
    public void Clear_RemovesAllDocuments()
    {
        var provider = new InMemorySearchProvider();
        provider.AddDocuments(
            IndexDocument.Create("1", "A", "A", SearchLanguage.En, _siteId),
            IndexDocument.Create("2", "B", "B", SearchLanguage.En, _siteId));

        provider.Clear();

        Assert.Equal(0, provider.DocumentCount);
    }

    #endregion
}
