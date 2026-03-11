using System.Net;
using System.Text.Json;
using Api.Endpoints;
using Microsoft.Extensions.Configuration;
using Moq;

namespace TextStack.UnitTests;

public class DistractorGeneratorTests
{
    private static IHttpClientFactory CreateHttpFactory(HttpStatusCode status, string responseText)
    {
        var json = JsonSerializer.Serialize(new { response = responseText });
        var handler = new FakeHandler(status, json);
        var client = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:11434") };
        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(client);
        return factory.Object;
    }

    private static IConfiguration CreateConfig() =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Ollama:BaseUrl"] = "http://localhost:11434",
                ["Ollama:Model"] = "gemma3:4b",
                ["Ollama:TimeoutSeconds"] = "5",
            })
            .Build();

    // === Structured response parsing ===

    [Fact]
    public async Task Generate_StructuredResponse_ParsesDistractorsAndHint()
    {
        var response = "DISTRACTORS: fuzzy, bright, sharp, narrow, gentle\nHINT: Moving quickly without delay.";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var (distractors, hint) = await DistractorGenerator.GenerateAsync(
            "fast", "en", "Quick", null, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.Equal(5, distractors!.Count);
        Assert.Contains("fuzzy", distractors);
        Assert.Contains("gentle", distractors);
        Assert.Equal("Moving quickly without delay.", hint);
    }

    [Fact]
    public async Task Generate_HintContainsWord_HintExcluded()
    {
        var response = "DISTRACTORS: a, b, c, d, e\nHINT: The word fast means quick.";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var (_, hint) = await DistractorGenerator.GenerateAsync(
            "fast", "en", null, null, factory, CreateConfig(), CancellationToken.None);

        Assert.Null(hint);
    }

    [Fact]
    public async Task Generate_DistractorContainsOriginalWord_Excluded()
    {
        var response = "DISTRACTORS: fast, bright, sharp, narrow, gentle";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var (distractors, _) = await DistractorGenerator.GenerateAsync(
            "fast", "en", null, null, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.DoesNotContain("fast", distractors!);
    }

    [Fact]
    public async Task Generate_DuplicateDistractors_Deduplicated()
    {
        var response = "DISTRACTORS: bright, bright, sharp, narrow, gentle";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var (distractors, _) = await DistractorGenerator.GenerateAsync(
            "fast", "en", null, null, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.Equal(distractors!.Count, distractors.Distinct().Count());
    }

    [Fact]
    public async Task Generate_LessThan3Distractors_ReturnsNull()
    {
        var response = "DISTRACTORS: one, two";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var (distractors, _) = await DistractorGenerator.GenerateAsync(
            "fast", "en", null, null, factory, CreateConfig(), CancellationToken.None);

        Assert.Null(distractors);
    }

    [Fact]
    public async Task Generate_MultiWordDistractors_Filtered()
    {
        var response = "DISTRACTORS: very bright, sharp, narrow, gentle, bold";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var (distractors, _) = await DistractorGenerator.GenerateAsync(
            "fast", "en", null, null, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.DoesNotContain("very bright", distractors!);
    }

    // === Fallback parsing (no DISTRACTORS: prefix) ===

    [Fact]
    public async Task Generate_NoPrefix_FallsBackToCommaParsing()
    {
        var response = "bright, sharp, narrow, gentle, bold";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var (distractors, _) = await DistractorGenerator.GenerateAsync(
            "fast", "en", null, null, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.True(distractors!.Count >= 3);
    }

    [Fact]
    public async Task Generate_NumberedList_StripsNumbers()
    {
        var response = "DISTRACTORS: 1. bright, 2. sharp, 3. narrow, 4. gentle, 5. bold";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var (distractors, _) = await DistractorGenerator.GenerateAsync(
            "fast", "en", null, null, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.Contains("bright", distractors!);
        Assert.DoesNotContain("1. bright", distractors!);
    }

    // === API failure ===

    [Fact]
    public async Task Generate_ApiError_ReturnsNulls()
    {
        var factory = CreateHttpFactory(HttpStatusCode.InternalServerError, "");

        var (distractors, hint) = await DistractorGenerator.GenerateAsync(
            "fast", "en", null, null, factory, CreateConfig(), CancellationToken.None);

        Assert.Null(distractors);
        Assert.Null(hint);
    }

    [Fact]
    public async Task Generate_EmptyResponse_ReturnsNulls()
    {
        var factory = CreateHttpFactory(HttpStatusCode.OK, "");

        var (distractors, hint) = await DistractorGenerator.GenerateAsync(
            "fast", "en", null, null, factory, CreateConfig(), CancellationToken.None);

        Assert.Null(distractors);
        Assert.Null(hint);
    }

    [Fact]
    public async Task Generate_DistractorsLowercased()
    {
        var response = "DISTRACTORS: Bright, SHARP, Narrow, Gentle, Bold";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var (distractors, _) = await DistractorGenerator.GenerateAsync(
            "fast", "en", null, null, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.All(distractors!, d => Assert.Equal(d, d.ToLowerInvariant()));
    }

    [Fact]
    public async Task Generate_Max5Distractors()
    {
        var response = "DISTRACTORS: a, b, c, d, e, f, g, h";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var (distractors, _) = await DistractorGenerator.GenerateAsync(
            "fast", "en", null, null, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.True(distractors!.Count <= 5);
    }

    [Fact]
    public async Task Generate_LongDistractors_Filtered()
    {
        var longWord = new string('a', 60);
        var response = $"DISTRACTORS: {longWord}, bright, sharp, narrow, gentle";
        var factory = CreateHttpFactory(HttpStatusCode.OK, response);

        var (distractors, _) = await DistractorGenerator.GenerateAsync(
            "fast", "en", null, null, factory, CreateConfig(), CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.DoesNotContain(longWord, distractors!);
    }

    private class FakeHandler(HttpStatusCode status, string body) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(status)
            {
                Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json")
            });
    }
}
