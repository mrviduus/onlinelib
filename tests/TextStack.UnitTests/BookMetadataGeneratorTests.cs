using Domain.LLM;
using Moq;
using Worker.Services;

namespace TextStack.UnitTests;

public class BookMetadataGeneratorTests
{
    private static BookMetadataGenerator CreateGenerator(string llmResponse)
    {
        var llm = new Mock<ILlmService>();
        llm.Setup(l => l.CompleteAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
           .ReturnsAsync(llmResponse);

        var factory = new Mock<ILlmServiceFactory>();
        factory.Setup(f => f.Get("BookMetadata")).Returns(llm.Object);

        return new BookMetadataGenerator(factory.Object);
    }

    [Fact]
    public async Task GenerateAsync_ValidResponse_ParsesGenreAndYear()
    {
        var gen = CreateGenerator("GENRE: Fiction\nYEAR: 1897");

        var result = await gen.GenerateAsync("Dracula", "Bram Stoker", false, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Fiction", result!.Genre);
        Assert.Equal(1897, result.PublishedYear);
        Assert.Null(result.Description);
    }

    [Fact]
    public async Task GenerateAsync_WithDescription_ParsesAll()
    {
        var gen = CreateGenerator(
            "GENRE: Science Fiction\nYEAR: 1984\nDESCRIPTION: A dystopian novel about totalitarian surveillance and control in a future society.");

        var result = await gen.GenerateAsync("1984", "George Orwell", true, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Science Fiction", result!.Genre);
        Assert.Equal(1984, result.PublishedYear);
        Assert.NotNull(result.Description);
        Assert.Contains("dystopian", result.Description);
    }

    [Fact]
    public async Task GenerateAsync_DescriptionIgnored_WhenNeedsDescriptionFalse()
    {
        var gen = CreateGenerator(
            "GENRE: Fiction\nYEAR: 1925\nDESCRIPTION: Some description here for the book.");

        var result = await gen.GenerateAsync("The Great Gatsby", "F. Scott Fitzgerald", false, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Fiction", result!.Genre);
        Assert.Equal(1925, result.PublishedYear);
        Assert.Null(result.Description);
    }

    [Fact]
    public async Task GenerateAsync_InvalidGenre_ReturnsNull()
    {
        var gen = CreateGenerator("GENRE: Cooking\nYEAR: UNKNOWN");

        var result = await gen.GenerateAsync("Test", null, false, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task GenerateAsync_UnknownYear_OnlyGenre()
    {
        var gen = CreateGenerator("GENRE: Fantasy\nYEAR: UNKNOWN");

        var result = await gen.GenerateAsync("Some Book", null, false, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Fantasy", result!.Genre);
        Assert.Null(result.PublishedYear);
    }

    [Fact]
    public async Task GenerateAsync_FutureYear_Rejected()
    {
        var gen = CreateGenerator($"GENRE: Fiction\nYEAR: {DateTime.UtcNow.Year + 5}");

        var result = await gen.GenerateAsync("Test", null, false, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Fiction", result!.Genre);
        Assert.Null(result.PublishedYear);
    }

    [Fact]
    public async Task GenerateAsync_EmptyResponse_ReturnsNull()
    {
        var gen = CreateGenerator("");

        var result = await gen.GenerateAsync("Test", null, false, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task GenerateAsync_GarbageResponse_ReturnsNull()
    {
        var gen = CreateGenerator("I don't know that book sorry.");

        var result = await gen.GenerateAsync("Test", null, false, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task GenerateAsync_ShortDescription_Rejected()
    {
        var gen = CreateGenerator("GENRE: Fiction\nYEAR: 2000\nDESCRIPTION: Short.");

        var result = await gen.GenerateAsync("Test", null, true, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Fiction", result!.Genre);
        Assert.Null(result.Description);
    }

    [Theory]
    [InlineData("Fiction")]
    [InlineData("Non-Fiction")]
    [InlineData("Science Fiction")]
    [InlineData("Fantasy")]
    [InlineData("Mystery")]
    [InlineData("Romance")]
    [InlineData("Thriller")]
    [InlineData("Horror")]
    [InlineData("Biography")]
    [InlineData("History")]
    [InlineData("Science")]
    [InlineData("Philosophy")]
    [InlineData("Self-Help")]
    [InlineData("Poetry")]
    [InlineData("Drama")]
    [InlineData("Children")]
    [InlineData("Other")]
    public async Task GenerateAsync_AllValidGenres_Accepted(string genre)
    {
        var gen = CreateGenerator($"GENRE: {genre}\nYEAR: 2000");

        var result = await gen.GenerateAsync("Test Book", null, false, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(genre, result!.Genre);
    }

    [Fact]
    public async Task GenerateAsync_CaseInsensitiveGenre_Accepted()
    {
        var gen = CreateGenerator("GENRE: fiction\nYEAR: 2000");

        var result = await gen.GenerateAsync("Test", null, false, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("fiction", result!.Genre);
    }

    [Fact]
    public async Task GenerateAsync_ExtraWhitespace_Handled()
    {
        var gen = CreateGenerator("  GENRE:   Fantasy  \n  YEAR:   1937  ");

        var result = await gen.GenerateAsync("The Hobbit", "J.R.R. Tolkien", false, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Fantasy", result!.Genre);
        Assert.Equal(1937, result.PublishedYear);
    }
}
