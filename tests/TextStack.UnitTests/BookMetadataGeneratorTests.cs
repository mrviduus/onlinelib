using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Moq;
using Worker.Services;

namespace TextStack.UnitTests;

public class BookMetadataGeneratorTests
{
    private static IConfiguration CreateConfig() =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Ollama:BaseUrl"] = "http://localhost:11434",
                ["Ollama:Model"] = "gemma3:4b",
                ["Ollama:TimeoutSeconds"] = "5"
            })
            .Build();

    private static IHttpClientFactory CreateHttpFactory(HttpStatusCode status, string ollamaResponse)
    {
        var handler = new FakeHandler(status, ollamaResponse);
        var client = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:11434") };
        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(client);
        return factory.Object;
    }

    [Fact]
    public async Task GenerateAsync_ValidResponse_ParsesGenreAndYear()
    {
        var response = "GENRE: Fiction\nYEAR: 1897";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var result = await BookMetadataGenerator.GenerateAsync(
            "Dracula", "Bram Stoker", false, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Fiction", result.Genre);
        Assert.Equal(1897, result.PublishedYear);
        Assert.Null(result.Description);
    }

    [Fact]
    public async Task GenerateAsync_WithDescription_ParsesAll()
    {
        var response = "GENRE: Science Fiction\nYEAR: 1984\nDESCRIPTION: A dystopian novel about totalitarian surveillance and control in a future society.";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var result = await BookMetadataGenerator.GenerateAsync(
            "1984", "George Orwell", true, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Science Fiction", result.Genre);
        Assert.Equal(1984, result.PublishedYear);
        Assert.NotNull(result.Description);
        Assert.Contains("dystopian", result.Description);
    }

    [Fact]
    public async Task GenerateAsync_DescriptionIgnored_WhenNeedsDescriptionFalse()
    {
        var response = "GENRE: Fiction\nYEAR: 1925\nDESCRIPTION: Some description here for the book.";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var result = await BookMetadataGenerator.GenerateAsync(
            "The Great Gatsby", "F. Scott Fitzgerald", false, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Fiction", result.Genre);
        Assert.Equal(1925, result.PublishedYear);
        Assert.Null(result.Description);
    }

    [Fact]
    public async Task GenerateAsync_InvalidGenre_ReturnsNull()
    {
        var response = "GENRE: Cooking\nYEAR: UNKNOWN";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var result = await BookMetadataGenerator.GenerateAsync(
            "Test", null, false, factory, CreateConfig(), CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task GenerateAsync_UnknownYear_OnlyGenre()
    {
        var response = "GENRE: Fantasy\nYEAR: UNKNOWN";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var result = await BookMetadataGenerator.GenerateAsync(
            "Some Book", null, false, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Fantasy", result.Genre);
        Assert.Null(result.PublishedYear);
    }

    [Fact]
    public async Task GenerateAsync_FutureYear_Rejected()
    {
        var response = $"GENRE: Fiction\nYEAR: {DateTime.UtcNow.Year + 5}";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var result = await BookMetadataGenerator.GenerateAsync(
            "Test", null, false, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Fiction", result.Genre);
        Assert.Null(result.PublishedYear);
    }

    [Fact]
    public async Task GenerateAsync_HttpError_ReturnsNull()
    {
        var factory = CreateHttpFactory(HttpStatusCode.ServiceUnavailable, "");

        var result = await BookMetadataGenerator.GenerateAsync(
            "Test", null, false, factory, CreateConfig(), CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task GenerateAsync_EmptyResponse_ReturnsNull()
    {
        var factory = CreateHttpFactory(HttpStatusCode.OK, "");

        var result = await BookMetadataGenerator.GenerateAsync(
            "Test", null, false, factory, CreateConfig(), CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task GenerateAsync_GarbageResponse_ReturnsNull()
    {
        var factory = CreateHttpFactory(HttpStatusCode.OK, "I don't know that book sorry.");

        var result = await BookMetadataGenerator.GenerateAsync(
            "Test", null, false, factory, CreateConfig(), CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task GenerateAsync_ShortDescription_Rejected()
    {
        var response = "GENRE: Fiction\nYEAR: 2000\nDESCRIPTION: Short.";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var result = await BookMetadataGenerator.GenerateAsync(
            "Test", null, true, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Fiction", result.Genre);
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
        var response = $"GENRE: {genre}\nYEAR: 2000";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var result = await BookMetadataGenerator.GenerateAsync(
            "Test Book", null, false, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(genre, result.Genre);
    }

    [Fact]
    public async Task GenerateAsync_CaseInsensitiveGenre_Accepted()
    {
        var response = "GENRE: fiction\nYEAR: 2000";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var result = await BookMetadataGenerator.GenerateAsync(
            "Test", null, false, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("fiction", result.Genre);
    }

    [Fact]
    public async Task GenerateAsync_ExtraWhitespace_Handled()
    {
        var response = "  GENRE:   Fantasy  \n  YEAR:   1937  ";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var result = await BookMetadataGenerator.GenerateAsync(
            "The Hobbit", "J.R.R. Tolkien", false, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Fantasy", result.Genre);
        Assert.Equal(1937, result.PublishedYear);
    }

    private class FakeHandler(HttpStatusCode status, string ollamaResponse) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var json = JsonSerializer.Serialize(new { response = ollamaResponse });
            return Task.FromResult(new HttpResponseMessage(status)
            {
                Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
            });
        }
    }
}
