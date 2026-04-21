using System.Net;
using System.Text.Json;
using Moq;
using TextStack.Vocabulary;

namespace TextStack.UnitTests;

public class DefinitionEnricherTests
{
    private static DefinitionEnricher CreateEnricher(HttpStatusCode status, string json)
    {
        var handler = new FakeHandler(status, json);
        var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.dictionaryapi.dev") };
        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(client);
        return new DefinitionEnricher(factory.Object);
    }

    private static DefinitionEnricher CreateEnricher(HttpMessageHandler handler)
    {
        var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.dictionaryapi.dev") };
        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(client);
        return new DefinitionEnricher(factory.Object);
    }

    private static string BuildApiResponse(string word, List<(string pos, List<string> defs)> meanings)
    {
        var entry = new
        {
            word,
            meanings = meanings.Select(m => new
            {
                partOfSpeech = m.pos,
                definitions = m.defs.Select(d => new { definition = d }).ToList()
            }).ToList()
        };
        return JsonSerializer.Serialize(new[] { entry });
    }

    [Fact]
    public async Task FetchDefinition_ValidResponse_FormatsDefinition()
    {
        var json = BuildApiResponse("scan", [
            ("verb", ["To examine sequentially.", "To look about for."]),
            ("noun", ["The act of scanning."])
        ]);
        var enricher = CreateEnricher(HttpStatusCode.OK, json);

        var result = await enricher.FetchDefinitionAsync("scan", "en", CancellationToken.None);

        Assert.NotNull(result);
        Assert.Contains("Verb:", result);
        Assert.Contains("1. To examine sequentially.", result);
        Assert.Contains("2. To look about for.", result);
        Assert.Contains("Noun:", result);
        Assert.Contains("1. The act of scanning.", result);
    }

    [Fact]
    public async Task FetchDefinition_NotFound_ReturnsNull()
    {
        var enricher = CreateEnricher(HttpStatusCode.NotFound, "");

        var result = await enricher.FetchDefinitionAsync("xyznotaword", "en", CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task FetchDefinition_EmptyMeanings_ReturnsNull()
    {
        var json = JsonSerializer.Serialize(new[] { new { word = "test", meanings = Array.Empty<object>() } });
        var enricher = CreateEnricher(HttpStatusCode.OK, json);

        var result = await enricher.FetchDefinitionAsync("test", "en", CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task FetchDefinition_TakesMax2DefsPerMeaning()
    {
        var json = BuildApiResponse("run", [
            ("verb", ["Def 1.", "Def 2.", "Def 3.", "Def 4."])
        ]);
        var enricher = CreateEnricher(HttpStatusCode.OK, json);

        var result = await enricher.FetchDefinitionAsync("run", "en", CancellationToken.None);

        Assert.NotNull(result);
        Assert.Contains("1. Def 1.", result);
        Assert.Contains("2. Def 2.", result);
        Assert.DoesNotContain("3. Def 3.", result);
    }

    [Fact]
    public async Task FetchDefinition_TakesMax3Meanings()
    {
        var json = BuildApiResponse("set", [
            ("verb", ["V def."]),
            ("noun", ["N def."]),
            ("adjective", ["A def."]),
            ("adverb", ["Adv def."])
        ]);
        var enricher = CreateEnricher(HttpStatusCode.OK, json);

        var result = await enricher.FetchDefinitionAsync("set", "en", CancellationToken.None);

        Assert.NotNull(result);
        Assert.Contains("Verb:", result);
        Assert.Contains("Noun:", result);
        Assert.Contains("Adjective:", result);
        Assert.DoesNotContain("Adverb:", result);
    }

    [Fact]
    public async Task FetchDefinition_CapitalizesPartOfSpeech()
    {
        var json = BuildApiResponse("fast", [("adjective", ["Quick."])]);
        var enricher = CreateEnricher(HttpStatusCode.OK, json);

        var result = await enricher.FetchDefinitionAsync("fast", "en", CancellationToken.None);

        Assert.NotNull(result);
        Assert.StartsWith("Adjective:", result);
    }

    [Fact]
    public async Task FetchDefinition_GermanLanguage_PassesCorrectCode()
    {
        var handler = new CapturingHandler();
        var enricher = CreateEnricher(handler);

        await enricher.FetchDefinitionAsync("wort", "de", CancellationToken.None);

        Assert.NotNull(handler.LastRequestUri);
        Assert.Contains("/de/", handler.LastRequestUri.ToString());
    }

    private class FakeHandler(HttpStatusCode status, string body) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(status)
            {
                Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json")
            });
    }

    private class CapturingHandler : HttpMessageHandler
    {
        public Uri? LastRequestUri { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            LastRequestUri = request.RequestUri;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
        }
    }
}
