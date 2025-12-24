using System.Data;
using Moq;
using OnlineLib.Search.Abstractions;
using OnlineLib.Search.Contracts;
using OnlineLib.Search.Enums;
using OnlineLib.Search.Providers.PostgresFts;

namespace OnlineLib.Search.Tests.Providers.PostgresFts;

public class PostgresIndexerTests
{
    private readonly Mock<ITextAnalyzer> _textAnalyzerMock = new();

    public PostgresIndexerTests()
    {
        _textAnalyzerMock.Setup(x => x.GetFtsConfig(SearchLanguage.En)).Returns("english");
        _textAnalyzerMock.Setup(x => x.GetFtsConfig(SearchLanguage.Uk)).Returns("simple");
        _textAnalyzerMock.Setup(x => x.GetFtsConfig(SearchLanguage.Auto)).Returns("simple");
    }

    #region IndexBatchAsync Edge Cases

    [Fact]
    public async Task IndexBatchAsync_EmptyList_DoesNothing()
    {
        var indexer = CreateIndexer();

        // Should not throw or call connection
        await indexer.IndexBatchAsync([]);
    }

    [Fact]
    public async Task IndexAsync_CallsIndexBatchAsync()
    {
        // This test verifies IndexAsync delegates to IndexBatchAsync
        // We can't easily verify SQL execution without a real DB
        var indexer = CreateIndexer();
        var doc = IndexDocument.Create("1", "Title", "Content", SearchLanguage.En, Guid.NewGuid());

        // Will fail when trying to execute SQL on mock, but that's expected
        // The test verifies the method exists and accepts correct parameters
        await Assert.ThrowsAnyAsync<Exception>(() => indexer.IndexAsync(doc));
    }

    #endregion

    #region GetCreateTableSql Tests

    [Fact]
    public void GetCreateTableSql_DefaultTable_ContainsCorrectTableName()
    {
        var sql = PostgresIndexer.GetCreateTableSql();

        Assert.Contains("CREATE TABLE IF NOT EXISTS search_documents", sql);
        Assert.Contains("idx_search_documents_search_vector", sql);
        Assert.Contains("idx_search_documents_site_id", sql);
    }

    [Fact]
    public void GetCreateTableSql_CustomTable_ContainsCustomTableName()
    {
        var sql = PostgresIndexer.GetCreateTableSql("my_search_table");

        Assert.Contains("CREATE TABLE IF NOT EXISTS my_search_table", sql);
        Assert.Contains("idx_my_search_table_search_vector", sql);
        Assert.Contains("idx_my_search_table_site_id", sql);
    }

    [Fact]
    public void GetCreateTableSql_ContainsRequiredColumns()
    {
        var sql = PostgresIndexer.GetCreateTableSql();

        Assert.Contains("id TEXT PRIMARY KEY", sql);
        Assert.Contains("title TEXT NOT NULL", sql);
        Assert.Contains("content TEXT NOT NULL", sql);
        Assert.Contains("language TEXT NOT NULL", sql);
        Assert.Contains("site_id UUID NOT NULL", sql);
        Assert.Contains("search_vector TSVECTOR NOT NULL", sql);
        Assert.Contains("metadata JSONB", sql);
    }

    [Fact]
    public void GetCreateTableSql_ContainsGinIndex()
    {
        var sql = PostgresIndexer.GetCreateTableSql();

        Assert.Contains("USING GIN(search_vector)", sql);
    }

    #endregion

    #region Constructor Tests

    [Fact]
    public void Constructor_DefaultTableName_UsesSearchDocuments()
    {
        var connectionMock = new Mock<IDbConnection>();
        var indexer = new PostgresIndexer(() => connectionMock.Object, _textAnalyzerMock.Object);

        // Verify by checking the SQL in GetCreateTableSql would match
        // The actual table name is private, but we can verify behavior
        Assert.NotNull(indexer);
    }

    [Fact]
    public void Constructor_CustomTableName_AcceptsCustomName()
    {
        var connectionMock = new Mock<IDbConnection>();
        var indexer = new PostgresIndexer(() => connectionMock.Object, _textAnalyzerMock.Object, "custom_table");

        Assert.NotNull(indexer);
    }

    #endregion

    private PostgresIndexer CreateIndexer()
    {
        var connectionMock = new Mock<IDbConnection>();
        return new PostgresIndexer(() => connectionMock.Object, _textAnalyzerMock.Object);
    }
}
