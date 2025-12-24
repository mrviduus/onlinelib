using OnlineLib.Search.Abstractions;
using OnlineLib.Search.Contracts;

namespace OnlineLib.Search.Tests.Mocks;

/// <summary>
/// Configurable mock search provider for testing consumers.
/// Allows setting up expected responses and tracking calls.
/// </summary>
public sealed class MockSearchProvider : ISearchProvider
{
    private SearchResult _searchResult = SearchResult.Empty;
    private IReadOnlyList<Suggestion> _suggestions = [];
    private Exception? _searchException;
    private Exception? _suggestException;

    /// <summary>
    /// List of all search requests made to this provider.
    /// </summary>
    public List<SearchRequest> SearchCalls { get; } = [];

    /// <summary>
    /// List of all suggest calls made to this provider (prefix, siteId, limit).
    /// </summary>
    public List<(string Prefix, Guid SiteId, int Limit)> SuggestCalls { get; } = [];

    /// <summary>
    /// Configures the result to return from SearchAsync.
    /// </summary>
    public MockSearchProvider ReturnsSearchResult(SearchResult result)
    {
        _searchResult = result;
        _searchException = null;
        return this;
    }

    /// <summary>
    /// Configures SearchAsync to throw an exception.
    /// </summary>
    public MockSearchProvider ThrowsOnSearch(Exception exception)
    {
        _searchException = exception;
        return this;
    }

    /// <summary>
    /// Configures the suggestions to return from SuggestAsync.
    /// </summary>
    public MockSearchProvider ReturnsSuggestions(params Suggestion[] suggestions)
    {
        _suggestions = suggestions;
        _suggestException = null;
        return this;
    }

    /// <summary>
    /// Configures SuggestAsync to throw an exception.
    /// </summary>
    public MockSearchProvider ThrowsOnSuggest(Exception exception)
    {
        _suggestException = exception;
        return this;
    }

    /// <summary>
    /// Resets all configured responses and call tracking.
    /// </summary>
    public void Reset()
    {
        _searchResult = SearchResult.Empty;
        _suggestions = [];
        _searchException = null;
        _suggestException = null;
        SearchCalls.Clear();
        SuggestCalls.Clear();
    }

    public Task<SearchResult> SearchAsync(SearchRequest request, CancellationToken ct = default)
    {
        SearchCalls.Add(request);

        if (_searchException != null)
            throw _searchException;

        return Task.FromResult(_searchResult);
    }

    public Task<IReadOnlyList<Suggestion>> SuggestAsync(
        string prefix,
        Guid siteId,
        int limit = 10,
        CancellationToken ct = default)
    {
        SuggestCalls.Add((prefix, siteId, limit));

        if (_suggestException != null)
            throw _suggestException;

        return Task.FromResult(_suggestions);
    }
}
