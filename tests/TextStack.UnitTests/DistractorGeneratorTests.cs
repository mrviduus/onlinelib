using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Moq;
using TextStack.Vocabulary;

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

    private static IOptions<VocabularyOptions> CreateOptions() =>
        Options.Create(new VocabularyOptions
        {
            OllamaBaseUrl = "http://localhost:11434",
            OllamaModel = "gemma3:4b",
            OllamaTimeoutSeconds = 5,
        });

    private static DistractorGenerator CreateGenerator(HttpStatusCode status, string responseText) =>
        new(CreateHttpFactory(status, responseText), CreateOptions());

    // === Structured response parsing ===

    [Fact]
    public async Task Generate_StructuredResponse_ParsesDistractorsAndHint()
    {
        var gen = CreateGenerator(HttpStatusCode.OK,
            "DISTRACTORS: fuzzy, bright, sharp, narrow, gentle\nHINT: Moving quickly without delay.");

        var (distractors, hint) = await gen.GenerateAsync(
            "fast", "en", "Quick", null, CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.Equal(5, distractors!.Count);
        Assert.Contains("fuzzy", distractors);
        Assert.Contains("gentle", distractors);
        Assert.Equal("Moving quickly without delay.", hint);
    }

    [Fact]
    public async Task Generate_HintContainsWord_HintExcluded()
    {
        var gen = CreateGenerator(HttpStatusCode.OK,
            "DISTRACTORS: a, b, c, d, e\nHINT: The word fast means quick.");

        var (_, hint) = await gen.GenerateAsync(
            "fast", "en", null, null, CancellationToken.None);

        Assert.Null(hint);
    }

    [Fact]
    public async Task Generate_DistractorContainsOriginalWord_Excluded()
    {
        var gen = CreateGenerator(HttpStatusCode.OK,
            "DISTRACTORS: fast, bright, sharp, narrow, gentle");

        var (distractors, _) = await gen.GenerateAsync(
            "fast", "en", null, null, CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.DoesNotContain("fast", distractors!);
    }

    [Fact]
    public async Task Generate_DuplicateDistractors_Deduplicated()
    {
        var gen = CreateGenerator(HttpStatusCode.OK,
            "DISTRACTORS: bright, bright, sharp, narrow, gentle");

        var (distractors, _) = await gen.GenerateAsync(
            "fast", "en", null, null, CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.Equal(distractors!.Count, distractors.Distinct().Count());
    }

    [Fact]
    public async Task Generate_LessThan3Distractors_ReturnsNull()
    {
        var gen = CreateGenerator(HttpStatusCode.OK,
            "DISTRACTORS: one, two");

        var (distractors, _) = await gen.GenerateAsync(
            "fast", "en", null, null, CancellationToken.None);

        Assert.Null(distractors);
    }

    [Fact]
    public async Task Generate_MultiWordDistractors_Filtered()
    {
        var gen = CreateGenerator(HttpStatusCode.OK,
            "DISTRACTORS: very bright, sharp, narrow, gentle, bold");

        var (distractors, _) = await gen.GenerateAsync(
            "fast", "en", null, null, CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.DoesNotContain("very bright", distractors!);
    }

    // === Fallback parsing (no DISTRACTORS: prefix) ===

    [Fact]
    public async Task Generate_NoPrefix_FallsBackToCommaParsing()
    {
        var gen = CreateGenerator(HttpStatusCode.OK,
            "bright, sharp, narrow, gentle, bold");

        var (distractors, _) = await gen.GenerateAsync(
            "fast", "en", null, null, CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.True(distractors!.Count >= 3);
    }

    [Fact]
    public async Task Generate_NumberedList_StripsNumbers()
    {
        var gen = CreateGenerator(HttpStatusCode.OK,
            "DISTRACTORS: 1. bright, 2. sharp, 3. narrow, 4. gentle, 5. bold");

        var (distractors, _) = await gen.GenerateAsync(
            "fast", "en", null, null, CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.Contains("bright", distractors!);
        Assert.DoesNotContain("1. bright", distractors!);
    }

    // === API failure ===

    [Fact]
    public async Task Generate_ApiError_ReturnsNulls()
    {
        var gen = CreateGenerator(HttpStatusCode.InternalServerError, "");

        var (distractors, hint) = await gen.GenerateAsync(
            "fast", "en", null, null, CancellationToken.None);

        Assert.Null(distractors);
        Assert.Null(hint);
    }

    [Fact]
    public async Task Generate_EmptyResponse_ReturnsNulls()
    {
        var gen = CreateGenerator(HttpStatusCode.OK, "");

        var (distractors, hint) = await gen.GenerateAsync(
            "fast", "en", null, null, CancellationToken.None);

        Assert.Null(distractors);
        Assert.Null(hint);
    }

    [Fact]
    public async Task Generate_DistractorsLowercased()
    {
        var gen = CreateGenerator(HttpStatusCode.OK,
            "DISTRACTORS: Bright, SHARP, Narrow, Gentle, Bold");

        var (distractors, _) = await gen.GenerateAsync(
            "fast", "en", null, null, CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.All(distractors!, d => Assert.Equal(d, d.ToLowerInvariant()));
    }

    [Fact]
    public async Task Generate_Max5Distractors()
    {
        var gen = CreateGenerator(HttpStatusCode.OK,
            "DISTRACTORS: a, b, c, d, e, f, g, h");

        var (distractors, _) = await gen.GenerateAsync(
            "fast", "en", null, null, CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.True(distractors!.Count <= 5);
    }

    [Fact]
    public async Task Generate_LongDistractors_Filtered()
    {
        var longWord = new string('a', 60);
        var gen = CreateGenerator(HttpStatusCode.OK,
            $"DISTRACTORS: {longWord}, bright, sharp, narrow, gentle");

        var (distractors, _) = await gen.GenerateAsync(
            "fast", "en", null, null, CancellationToken.None);

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
