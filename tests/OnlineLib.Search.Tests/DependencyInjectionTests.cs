using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using OnlineLib.Search.Abstractions;
using OnlineLib.Search.Analyzers;
using OnlineLib.Search.Configuration;
using OnlineLib.Search.Providers.PostgresFts;

namespace OnlineLib.Search.Tests;

public class DependencyInjectionTests
{
    #region AddOnlineLibSearch Tests

    [Fact]
    public void AddOnlineLibSearch_RegistersCoreServices()
    {
        var services = new ServiceCollection();

        services.AddOnlineLibSearch();

        var provider = services.BuildServiceProvider();

        Assert.NotNull(provider.GetService<ITextAnalyzer>());
        Assert.NotNull(provider.GetService<IQueryBuilder>());
        Assert.NotNull(provider.GetService<IHighlighter>());
    }

    [Fact]
    public void AddOnlineLibSearch_TextAnalyzer_IsMultilingualAnalyzer()
    {
        var services = new ServiceCollection();

        services.AddOnlineLibSearch();

        var provider = services.BuildServiceProvider();
        var analyzer = provider.GetRequiredService<ITextAnalyzer>();

        Assert.IsType<MultilingualAnalyzer>(analyzer);
    }

    [Fact]
    public void AddOnlineLibSearch_QueryBuilder_IsTsQueryBuilder()
    {
        var services = new ServiceCollection();

        services.AddOnlineLibSearch();

        var provider = services.BuildServiceProvider();
        var builder = provider.GetRequiredService<IQueryBuilder>();

        Assert.IsType<TsQueryBuilder>(builder);
    }

    [Fact]
    public void AddOnlineLibSearch_Highlighter_IsPostgresHighlighter()
    {
        var services = new ServiceCollection();

        services.AddOnlineLibSearch();

        var provider = services.BuildServiceProvider();
        var highlighter = provider.GetRequiredService<IHighlighter>();

        Assert.IsType<PostgresHighlighter>(highlighter);
    }

    [Fact]
    public void AddOnlineLibSearch_ConfiguresOptions()
    {
        var services = new ServiceCollection();

        services.AddOnlineLibSearch(options =>
        {
            options.DefaultLimit = 50;
            options.MaxLimit = 200;
        });

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<SearchOptions>>().Value;

        Assert.Equal(50, options.DefaultLimit);
        Assert.Equal(200, options.MaxLimit);
    }

    [Fact]
    public void AddOnlineLibSearch_DefaultOptions_HasCorrectDefaults()
    {
        var services = new ServiceCollection();

        services.AddOnlineLibSearch();

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<SearchOptions>>().Value;

        Assert.Equal(20, options.DefaultLimit);
        Assert.Equal(100, options.MaxLimit);
        Assert.True(options.EnableHighlights);
        Assert.Equal(2, options.MinSuggestionPrefixLength);
        Assert.Equal(10, options.DefaultSuggestionLimit);
    }

    #endregion

    #region AddPostgresFtsProvider Tests

    [Fact]
    public void AddPostgresFtsProvider_WithConnectionString_RegistersProvider()
    {
        var services = new ServiceCollection();

        services.AddOnlineLibSearch();
        services.AddPostgresFtsProvider(options =>
        {
            options.ConnectionString = "Host=localhost;Database=test";
        });

        var provider = services.BuildServiceProvider();

        Assert.NotNull(provider.GetService<ISearchProvider>());
        Assert.NotNull(provider.GetService<ISearchIndexer>());
    }

    [Fact]
    public void AddPostgresFtsProvider_SearchProvider_IsPostgresSearchProvider()
    {
        var services = new ServiceCollection();

        services.AddOnlineLibSearch();
        services.AddPostgresFtsProvider(options =>
        {
            options.ConnectionString = "Host=localhost;Database=test";
        });

        var provider = services.BuildServiceProvider();
        var searchProvider = provider.GetRequiredService<ISearchProvider>();

        Assert.IsType<PostgresSearchProvider>(searchProvider);
    }

    [Fact]
    public void AddPostgresFtsProvider_Indexer_IsPostgresIndexer()
    {
        var services = new ServiceCollection();

        services.AddOnlineLibSearch();
        services.AddPostgresFtsProvider(options =>
        {
            options.ConnectionString = "Host=localhost;Database=test";
        });

        var provider = services.BuildServiceProvider();
        var indexer = provider.GetRequiredService<ISearchIndexer>();

        Assert.IsType<PostgresIndexer>(indexer);
    }

    [Fact]
    public void AddPostgresFtsProvider_WithoutConnectionString_ThrowsOnResolve()
    {
        var services = new ServiceCollection();

        services.AddOnlineLibSearch();
        services.AddPostgresFtsProvider();

        var provider = services.BuildServiceProvider();

        Assert.Throws<InvalidOperationException>(() =>
            provider.GetRequiredService<ISearchProvider>());
    }

    [Fact]
    public void AddPostgresFtsProvider_ConfiguresOptions()
    {
        var services = new ServiceCollection();

        services.AddOnlineLibSearch();
        services.AddPostgresFtsProvider(options =>
        {
            options.ConnectionString = "Host=localhost;Database=test";
            options.TableName = "custom_search";
            options.Highlights = new HighlightOptions { MaxFragments = 5 };
        });

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<PostgresFtsOptions>>().Value;

        Assert.Equal("Host=localhost;Database=test", options.ConnectionString);
        Assert.Equal("custom_search", options.TableName);
        Assert.Equal(5, options.Highlights.MaxFragments);
    }

    #endregion

    #region AddPostgresFtsProvider with Custom ConnectionFactory Tests

    [Fact]
    public void AddPostgresFtsProvider_CustomConnectionFactory_RegistersProvider()
    {
        var services = new ServiceCollection();

        services.AddOnlineLibSearch();
        services.AddPostgresFtsProvider(
            sp => () => throw new NotImplementedException("Test factory"));

        var provider = services.BuildServiceProvider();

        // Should be registered, but calling methods will use the custom factory
        Assert.NotNull(provider.GetService<ISearchProvider>());
        Assert.NotNull(provider.GetService<ISearchIndexer>());
    }

    #endregion
}
