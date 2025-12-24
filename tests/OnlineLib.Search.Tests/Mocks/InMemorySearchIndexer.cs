using System.Collections.Concurrent;
using OnlineLib.Search.Abstractions;
using OnlineLib.Search.Contracts;

namespace OnlineLib.Search.Tests.Mocks;

/// <summary>
/// In-memory search indexer for testing.
/// Can be paired with InMemorySearchProvider for full in-memory search.
/// </summary>
public sealed class InMemorySearchIndexer : ISearchIndexer
{
    private readonly ConcurrentDictionary<string, IndexDocument> _documents = new();
    private readonly InMemorySearchProvider? _searchProvider;

    /// <summary>
    /// Creates a standalone indexer.
    /// </summary>
    public InMemorySearchIndexer()
    {
    }

    /// <summary>
    /// Creates an indexer linked to an InMemorySearchProvider.
    /// Documents indexed here will be searchable via the provider.
    /// </summary>
    public InMemorySearchIndexer(InMemorySearchProvider searchProvider)
    {
        _searchProvider = searchProvider;
    }

    /// <summary>
    /// Gets the number of indexed documents.
    /// </summary>
    public int DocumentCount => _documents.Count;

    /// <summary>
    /// Gets all indexed documents.
    /// </summary>
    public IReadOnlyCollection<IndexDocument> Documents => _documents.Values.ToList();

    /// <summary>
    /// List of all index operations performed (documentId, operation).
    /// </summary>
    public List<(string DocumentId, IndexOperation Operation)> Operations { get; } = [];

    public Task IndexAsync(IndexDocument document, CancellationToken ct = default)
    {
        _documents[document.Id] = document;
        _searchProvider?.AddDocument(document);
        Operations.Add((document.Id, IndexOperation.Index));
        return Task.CompletedTask;
    }

    public Task IndexBatchAsync(IEnumerable<IndexDocument> documents, CancellationToken ct = default)
    {
        foreach (var doc in documents)
        {
            _documents[doc.Id] = doc;
            _searchProvider?.AddDocument(doc);
            Operations.Add((doc.Id, IndexOperation.Index));
        }
        return Task.CompletedTask;
    }

    public Task RemoveAsync(string documentId, CancellationToken ct = default)
    {
        _documents.TryRemove(documentId, out _);
        _searchProvider?.RemoveDocument(documentId);
        Operations.Add((documentId, IndexOperation.Remove));
        return Task.CompletedTask;
    }

    public Task RemoveBySiteAsync(Guid siteId, CancellationToken ct = default)
    {
        var toRemove = _documents
            .Where(kvp => kvp.Value.SiteId == siteId)
            .Select(kvp => kvp.Key)
            .ToList();

        foreach (var id in toRemove)
        {
            _documents.TryRemove(id, out _);
            _searchProvider?.RemoveDocument(id);
            Operations.Add((id, IndexOperation.Remove));
        }

        return Task.CompletedTask;
    }

    /// <summary>
    /// Clears all documents and operation history.
    /// </summary>
    public void Clear()
    {
        _documents.Clear();
        _searchProvider?.Clear();
        Operations.Clear();
    }

    public enum IndexOperation
    {
        Index,
        Remove
    }
}
