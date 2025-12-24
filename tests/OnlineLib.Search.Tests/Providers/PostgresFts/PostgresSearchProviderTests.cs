using System.Data;
using Moq;
using OnlineLib.Search.Abstractions;
using OnlineLib.Search.Contracts;
using OnlineLib.Search.Enums;
using OnlineLib.Search.Providers.PostgresFts;

namespace OnlineLib.Search.Tests.Providers.PostgresFts;

public class PostgresSearchProviderTests
{
    private readonly Mock<IQueryBuilder> _queryBuilderMock = new();
    private readonly Mock<ITextAnalyzer> _textAnalyzerMock = new();

    #region SearchAsync Edge Cases

    [Fact]
    public async Task SearchAsync_EmptyQuery_ReturnsEmpty()
    {
        var provider = CreateProvider();
        var request = new SearchRequest("", Guid.NewGuid());

        var result = await provider.SearchAsync(request);

        Assert.Equal(SearchResult.Empty, result);
    }

    [Fact]
    public async Task SearchAsync_WhitespaceQuery_ReturnsEmpty()
    {
        var provider = CreateProvider();
        var request = new SearchRequest("   ", Guid.NewGuid());

        var result = await provider.SearchAsync(request);

        Assert.Equal(SearchResult.Empty, result);
    }

    [Fact]
    public async Task SearchAsync_QueryBuilderReturnsEmpty_ReturnsEmpty()
    {
        _textAnalyzerMock.Setup(x => x.GetFtsConfig(It.IsAny<SearchLanguage>())).Returns("english");
        _queryBuilderMock.Setup(x => x.BuildQuery(It.IsAny<string>(), It.IsAny<SearchLanguage>()))
            .Returns(string.Empty);

        var provider = CreateProvider();
        var request = new SearchRequest("test", Guid.NewGuid());

        var result = await provider.SearchAsync(request);

        Assert.Equal(SearchResult.Empty, result);
    }

    #endregion

    #region SuggestAsync Edge Cases

    [Fact]
    public async Task SuggestAsync_EmptyPrefix_ReturnsEmpty()
    {
        var provider = CreateProvider();

        var result = await provider.SuggestAsync("", Guid.NewGuid());

        Assert.Empty(result);
    }

    [Fact]
    public async Task SuggestAsync_WhitespacePrefix_ReturnsEmpty()
    {
        var provider = CreateProvider();

        var result = await provider.SuggestAsync("   ", Guid.NewGuid());

        Assert.Empty(result);
    }

    [Fact]
    public async Task SuggestAsync_SingleCharPrefix_ReturnsEmpty()
    {
        // Prefix must be at least 2 characters
        var provider = CreateProvider();

        var result = await provider.SuggestAsync("a", Guid.NewGuid());

        Assert.Empty(result);
    }

    [Fact]
    public async Task SuggestAsync_NormalizerReturnsEmpty_ReturnsEmpty()
    {
        _textAnalyzerMock.Setup(x => x.Normalize(It.IsAny<string>())).Returns(string.Empty);

        var provider = CreateProvider();

        var result = await provider.SuggestAsync("test", Guid.NewGuid());

        Assert.Empty(result);
    }

    #endregion

    #region EscapeLikePattern Tests

    [Theory]
    [InlineData("hello", "hello")]
    [InlineData("hello%world", "hello\\%world")]
    [InlineData("hello_world", "hello\\_world")]
    [InlineData("test\\path", "test\\\\path")]
    [InlineData("50%_off\\sale", "50\\%\\_off\\\\sale")]
    public void EscapeLikePattern_EscapesSpecialCharacters(string input, string expected)
    {
        // Using reflection to test private method
        var method = typeof(PostgresSearchProvider).GetMethod(
            "EscapeLikePattern",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);

        var result = method?.Invoke(null, [input]) as string;

        Assert.Equal(expected, result);
    }

    #endregion

    private PostgresSearchProvider CreateProvider()
    {
        // Mock connection factory - not used in edge case tests
        var connectionMock = new Mock<IDbConnection>();
        Func<IDbConnection> connectionFactory = () => connectionMock.Object;

        return new PostgresSearchProvider(connectionFactory, _queryBuilderMock.Object, _textAnalyzerMock.Object);
    }
}
