using OnlineLib.Search.Contracts;
using OnlineLib.Search.Enums;

namespace OnlineLib.Search.Tests.Mocks;

public class InMemorySearchIndexerTests
{
    private readonly Guid _siteId = Guid.NewGuid();

    #region IndexAsync Tests

    [Fact]
    public async Task IndexAsync_AddsDocument()
    {
        var indexer = new InMemorySearchIndexer();
        var doc = IndexDocument.Create("1", "Test", "Content", SearchLanguage.En, _siteId);

        await indexer.IndexAsync(doc);

        Assert.Equal(1, indexer.DocumentCount);
        Assert.Contains(indexer.Documents, d => d.Id == "1");
    }

    [Fact]
    public async Task IndexAsync_TracksOperation()
    {
        var indexer = new InMemorySearchIndexer();
        var doc = IndexDocument.Create("1", "Test", "Content", SearchLanguage.En, _siteId);

        await indexer.IndexAsync(doc);

        Assert.Single(indexer.Operations);
        Assert.Equal("1", indexer.Operations[0].DocumentId);
        Assert.Equal(InMemorySearchIndexer.IndexOperation.Index, indexer.Operations[0].Operation);
    }

    [Fact]
    public async Task IndexAsync_UpdatesExistingDocument()
    {
        var indexer = new InMemorySearchIndexer();
        var doc1 = IndexDocument.Create("1", "Original", "Content", SearchLanguage.En, _siteId);
        var doc2 = IndexDocument.Create("1", "Updated", "New Content", SearchLanguage.En, _siteId);

        await indexer.IndexAsync(doc1);
        await indexer.IndexAsync(doc2);

        Assert.Equal(1, indexer.DocumentCount);
        Assert.Equal("Updated", indexer.Documents.First().Title);
    }

    #endregion

    #region IndexBatchAsync Tests

    [Fact]
    public async Task IndexBatchAsync_AddsMultipleDocuments()
    {
        var indexer = new InMemorySearchIndexer();
        var docs = new[]
        {
            IndexDocument.Create("1", "A", "A", SearchLanguage.En, _siteId),
            IndexDocument.Create("2", "B", "B", SearchLanguage.En, _siteId),
            IndexDocument.Create("3", "C", "C", SearchLanguage.En, _siteId)
        };

        await indexer.IndexBatchAsync(docs);

        Assert.Equal(3, indexer.DocumentCount);
        Assert.Equal(3, indexer.Operations.Count);
    }

    #endregion

    #region RemoveAsync Tests

    [Fact]
    public async Task RemoveAsync_RemovesDocument()
    {
        var indexer = new InMemorySearchIndexer();
        await indexer.IndexAsync(IndexDocument.Create("1", "Test", "Content", SearchLanguage.En, _siteId));

        await indexer.RemoveAsync("1");

        Assert.Equal(0, indexer.DocumentCount);
    }

    [Fact]
    public async Task RemoveAsync_TracksOperation()
    {
        var indexer = new InMemorySearchIndexer();
        await indexer.IndexAsync(IndexDocument.Create("1", "Test", "Content", SearchLanguage.En, _siteId));

        await indexer.RemoveAsync("1");

        Assert.Equal(2, indexer.Operations.Count);
        Assert.Equal(InMemorySearchIndexer.IndexOperation.Remove, indexer.Operations[1].Operation);
    }

    [Fact]
    public async Task RemoveAsync_NonExistent_NoError()
    {
        var indexer = new InMemorySearchIndexer();

        await indexer.RemoveAsync("nonexistent");

        Assert.Equal(0, indexer.DocumentCount);
    }

    #endregion

    #region RemoveBySiteAsync Tests

    [Fact]
    public async Task RemoveBySiteAsync_RemovesOnlySiteDocuments()
    {
        var indexer = new InMemorySearchIndexer();
        var otherSiteId = Guid.NewGuid();

        await indexer.IndexAsync(IndexDocument.Create("1", "A", "A", SearchLanguage.En, _siteId));
        await indexer.IndexAsync(IndexDocument.Create("2", "B", "B", SearchLanguage.En, _siteId));
        await indexer.IndexAsync(IndexDocument.Create("3", "C", "C", SearchLanguage.En, otherSiteId));

        await indexer.RemoveBySiteAsync(_siteId);

        Assert.Equal(1, indexer.DocumentCount);
        Assert.Equal("3", indexer.Documents.First().Id);
    }

    #endregion

    #region Integration with InMemorySearchProvider Tests

    [Fact]
    public async Task LinkedProvider_IndexedDocumentsAreSearchable()
    {
        var provider = new InMemorySearchProvider();
        var indexer = new InMemorySearchIndexer(provider);

        await indexer.IndexAsync(IndexDocument.Create("1", "Test Title", "Test content", SearchLanguage.En, _siteId));

        var result = await provider.SearchAsync(new SearchRequest("test", _siteId));

        Assert.Equal(1, result.TotalCount);
    }

    [Fact]
    public async Task LinkedProvider_RemovedDocumentsNotSearchable()
    {
        var provider = new InMemorySearchProvider();
        var indexer = new InMemorySearchIndexer(provider);

        await indexer.IndexAsync(IndexDocument.Create("1", "Test Title", "Test content", SearchLanguage.En, _siteId));
        await indexer.RemoveAsync("1");

        var result = await provider.SearchAsync(new SearchRequest("test", _siteId));

        Assert.Equal(0, result.TotalCount);
    }

    #endregion

    #region Clear Tests

    [Fact]
    public async Task Clear_RemovesAllDocumentsAndOperations()
    {
        var indexer = new InMemorySearchIndexer();
        await indexer.IndexAsync(IndexDocument.Create("1", "Test", "Content", SearchLanguage.En, _siteId));

        indexer.Clear();

        Assert.Equal(0, indexer.DocumentCount);
        Assert.Empty(indexer.Operations);
    }

    #endregion
}
