using OnlineLib.Search.Contracts;

namespace OnlineLib.Search.Abstractions;

public interface ISearchProvider
{
    Task<SearchResult> SearchAsync(SearchRequest request, CancellationToken ct = default);

    Task<IReadOnlyList<Suggestion>> SuggestAsync(
        string prefix,
        Guid siteId,
        int limit = 10,
        CancellationToken ct = default);
}
