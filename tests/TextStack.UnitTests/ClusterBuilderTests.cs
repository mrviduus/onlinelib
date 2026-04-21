using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Moq;
using TextStack.Vocabulary;

namespace TextStack.UnitTests;

public class ClusterBuilderTests
{
    private static readonly List<(Guid Id, string Word)> SampleWords =
    [
        (Guid.NewGuid(), "invest"),
        (Guid.NewGuid(), "dividend"),
        (Guid.NewGuid(), "yield"),
        (Guid.NewGuid(), "portfolio"),
        (Guid.NewGuid(), "equity"),
    ];

    private static IHttpClientFactory CreateHttpFactory(HttpStatusCode status, string responseText)
    {
        var json = JsonSerializer.Serialize(new { response = responseText });
        var handler = new FakeHandler(status, json);
        var client = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:11434") };
        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(client);
        return factory.Object;
    }

    private static IHttpClientFactory CreateThrowingFactory()
    {
        var handler = new ThrowingHandler();
        var client = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:11434") };
        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(client);
        return factory.Object;
    }

    private static IOptions<VocabularyOptions> CreateOptions() =>
        Options.Create(new VocabularyOptions
        {
            OllamaBaseUrl = "http://localhost:11434",
            OllamaModel = "qwen3:8b",
            OllamaTimeoutSeconds = 5,
        });

    private static ClusterBuilder CreateBuilder(HttpStatusCode status, string responseText) =>
        new(CreateHttpFactory(status, responseText), CreateOptions());

    [Fact]
    public async Task Build_FewerThan5Words_ReturnsNullWithoutCallingLlm()
    {
        var builder = CreateBuilder(HttpStatusCode.InternalServerError, "");
        var words = SampleWords.Take(4).ToList();

        var result = await builder.BuildAsync(words, "Atomic Habits", "en", CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task Build_ScoreBelowThreshold_ReturnsNull()
    {
        var builder = CreateBuilder(HttpStatusCode.OK,
            "SCORE: 0.5\nTHEME: misc\nTITLE: Mixed words\nMEMBERS: invest, dividend, yield");

        var result = await builder.BuildAsync(SampleWords, "Atomic Habits", "en", CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task Build_ScoreAtThreshold_ReturnsCandidate()
    {
        var builder = CreateBuilder(HttpStatusCode.OK,
            "SCORE: 0.7\nTHEME: finance\nTITLE: Investing terms\nMEMBERS: invest, dividend, yield, portfolio");

        var result = await builder.BuildAsync(SampleWords, "Atomic Habits", "en", CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(0.7, result!.CohesionScore);
        Assert.Equal("finance", result.Theme);
        Assert.Equal("Investing terms", result.Title);
        Assert.Equal(4, result.MemberWordIds.Count);
    }

    [Fact]
    public async Task Build_HighScore_FullCluster()
    {
        var builder = CreateBuilder(HttpStatusCode.OK,
            "SCORE: 0.95\nTHEME: finance\nTITLE: Investment vocabulary\nMEMBERS: invest, dividend, yield, portfolio, equity");

        var result = await builder.BuildAsync(SampleWords, "Atomic Habits", "en", CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(5, result!.MemberWordIds.Count);
        Assert.Equal(0.95, result.CohesionScore);
    }

    [Fact]
    public async Task Build_FewerThan3MatchedMembers_ReturnsNull()
    {
        var builder = CreateBuilder(HttpStatusCode.OK,
            "SCORE: 0.8\nTHEME: finance\nTITLE: Investing\nMEMBERS: invest, dividend");

        var result = await builder.BuildAsync(SampleWords, null, "en", CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task Build_MissingTitle_ReturnsNull()
    {
        var builder = CreateBuilder(HttpStatusCode.OK,
            "SCORE: 0.8\nTHEME: finance\nMEMBERS: invest, dividend, yield");

        var result = await builder.BuildAsync(SampleWords, null, "en", CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task Build_MissingScore_ReturnsNull()
    {
        var builder = CreateBuilder(HttpStatusCode.OK,
            "THEME: finance\nTITLE: Investing\nMEMBERS: invest, dividend, yield");

        var result = await builder.BuildAsync(SampleWords, null, "en", CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task Build_MembersCaseInsensitive_Matched()
    {
        var builder = CreateBuilder(HttpStatusCode.OK,
            "SCORE: 0.8\nTHEME: finance\nTITLE: Investing\nMEMBERS: INVEST, Dividend, YIELD");

        var result = await builder.BuildAsync(SampleWords, null, "en", CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(3, result!.MemberWordIds.Count);
    }

    [Fact]
    public async Task Build_UnknownMembers_OnlyMatchedReturned()
    {
        var builder = CreateBuilder(HttpStatusCode.OK,
            "SCORE: 0.8\nTHEME: finance\nTITLE: Investing\nMEMBERS: invest, dividend, yield, unrelated, foreign");

        var result = await builder.BuildAsync(SampleWords, null, "en", CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(3, result!.MemberWordIds.Count);
    }

    [Fact]
    public async Task Build_ApiError_ReturnsNull()
    {
        var builder = CreateBuilder(HttpStatusCode.InternalServerError, "");

        var result = await builder.BuildAsync(SampleWords, null, "en", CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task Build_EmptyResponse_ReturnsNull()
    {
        var builder = CreateBuilder(HttpStatusCode.OK, "");

        var result = await builder.BuildAsync(SampleWords, null, "en", CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task Build_HttpThrows_ReturnsNullWithoutPropagating()
    {
        var builder = new ClusterBuilder(CreateThrowingFactory(), CreateOptions());

        var result = await builder.BuildAsync(SampleWords, null, "en", CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task Build_TitleTooLong_Truncated()
    {
        var longTitle = new string('a', 250);
        var builder = CreateBuilder(HttpStatusCode.OK,
            $"SCORE: 0.8\nTHEME: x\nTITLE: {longTitle}\nMEMBERS: invest, dividend, yield");

        var result = await builder.BuildAsync(SampleWords, null, "en", CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(200, result!.Title.Length);
    }

    [Fact]
    public async Task Build_BlankTheme_NormalizedToNull()
    {
        var builder = CreateBuilder(HttpStatusCode.OK,
            "SCORE: 0.8\nTHEME:   \nTITLE: Investing\nMEMBERS: invest, dividend, yield");

        var result = await builder.BuildAsync(SampleWords, null, "en", CancellationToken.None);

        Assert.NotNull(result);
        Assert.Null(result!.Theme);
    }

    private class FakeHandler(HttpStatusCode status, string body) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(status)
            {
                Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json")
            });
    }

    private class ThrowingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            throw new HttpRequestException("network down");
    }
}
