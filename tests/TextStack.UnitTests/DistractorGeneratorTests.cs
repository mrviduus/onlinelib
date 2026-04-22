using Domain.LLM;
using Moq;
using TextStack.Vocabulary;

namespace TextStack.UnitTests;

public class DistractorGeneratorTests
{
    private static DistractorGenerator CreateGenerator(string llmResponse, bool throwOnCall = false)
    {
        var llm = new Mock<ILlmService>();
        if (throwOnCall)
        {
            llm.Setup(l => l.CompleteAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
               .ThrowsAsync(new HttpRequestException("mock"));
        }
        else
        {
            llm.Setup(l => l.CompleteAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
               .ReturnsAsync(llmResponse);
        }

        var factory = new Mock<ILlmServiceFactory>();
        factory.Setup(f => f.Get("Distractor")).Returns(llm.Object);

        return new DistractorGenerator(factory.Object);
    }

    // === Structured response parsing ===

    [Fact]
    public async Task Generate_StructuredResponse_ParsesDistractorsAndHint()
    {
        var gen = CreateGenerator(
            "DISTRACTORS: fuzzy, bright, sharp, narrow, gentle\nHINT: Moving quickly without delay.");

        var (distractors, hint, _) = await gen.GenerateAsync(
            "fast", "en", "Quick", null, "en", CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.Equal(5, distractors!.Count);
        Assert.Contains("fuzzy", distractors);
        Assert.Contains("gentle", distractors);
        Assert.Equal("Moving quickly without delay.", hint);
    }

    [Fact]
    public async Task Generate_HintContainsWord_HintExcluded()
    {
        var gen = CreateGenerator(
            "DISTRACTORS: a, b, c, d, e\nHINT: The word fast means quick.");

        var (_, hint, _) = await gen.GenerateAsync(
            "fast", "en", null, null, "en", CancellationToken.None);

        Assert.Null(hint);
    }

    [Fact]
    public async Task Generate_DistractorContainsOriginalWord_Excluded()
    {
        var gen = CreateGenerator(
            "DISTRACTORS: fast, bright, sharp, narrow, gentle");

        var (distractors, _, _) = await gen.GenerateAsync(
            "fast", "en", null, null, "en", CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.DoesNotContain("fast", distractors!);
    }

    [Fact]
    public async Task Generate_DuplicateDistractors_Deduplicated()
    {
        var gen = CreateGenerator(
            "DISTRACTORS: bright, bright, sharp, narrow, gentle");

        var (distractors, _, _) = await gen.GenerateAsync(
            "fast", "en", null, null, "en", CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.Equal(distractors!.Count, distractors.Distinct().Count());
    }

    [Fact]
    public async Task Generate_LessThan3Distractors_ReturnsNull()
    {
        var gen = CreateGenerator("DISTRACTORS: one, two");

        var (distractors, _, _) = await gen.GenerateAsync(
            "fast", "en", null, null, "en", CancellationToken.None);

        Assert.Null(distractors);
    }

    [Fact]
    public async Task Generate_MultiWordDistractors_Filtered()
    {
        var gen = CreateGenerator(
            "DISTRACTORS: very bright, sharp, narrow, gentle, bold");

        var (distractors, _, _) = await gen.GenerateAsync(
            "fast", "en", null, null, "en", CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.DoesNotContain("very bright", distractors!);
    }

    // === Fallback parsing (no DISTRACTORS: prefix) ===

    [Fact]
    public async Task Generate_NoPrefix_FallsBackToCommaParsing()
    {
        var gen = CreateGenerator("bright, sharp, narrow, gentle, bold");

        var (distractors, _, _) = await gen.GenerateAsync(
            "fast", "en", null, null, "en", CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.True(distractors!.Count >= 3);
    }

    [Fact]
    public async Task Generate_NumberedList_StripsNumbers()
    {
        var gen = CreateGenerator(
            "DISTRACTORS: 1. bright, 2. sharp, 3. narrow, 4. gentle, 5. bold");

        var (distractors, _, _) = await gen.GenerateAsync(
            "fast", "en", null, null, "en", CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.Contains("bright", distractors!);
        Assert.DoesNotContain("1. bright", distractors!);
    }

    [Fact]
    public async Task Generate_StructuredResponse_ParsesExplanation()
    {
        var gen = CreateGenerator(
            "DISTRACTORS: fuzzy, bright, sharp, narrow, gentle\nHINT: Moving quickly.\nEXPLANATION: Слово означает быстрый, скорый.");

        var (_, _, explanation) = await gen.GenerateAsync(
            "fast", "en", null, null, "ru", CancellationToken.None);

        Assert.Equal("Слово означает быстрый, скорый.", explanation);
    }

    // === LLM failure ===

    [Fact]
    public async Task Generate_LlmReturnsEmpty_ReturnsNulls()
    {
        var gen = CreateGenerator("");

        var (distractors, hint, explanation) = await gen.GenerateAsync(
            "fast", "en", null, null, "en", CancellationToken.None);

        Assert.Null(distractors);
        Assert.Null(hint);
        Assert.Null(explanation);
    }

    [Fact]
    public async Task Generate_DistractorsLowercased()
    {
        var gen = CreateGenerator(
            "DISTRACTORS: Bright, SHARP, Narrow, Gentle, Bold");

        var (distractors, _, _) = await gen.GenerateAsync(
            "fast", "en", null, null, "en", CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.All(distractors!, d => Assert.Equal(d, d.ToLowerInvariant()));
    }

    [Fact]
    public async Task Generate_Max5Distractors()
    {
        var gen = CreateGenerator(
            "DISTRACTORS: alpha, bravo, charlie, delta, echo, foxtrot, golf, hotel");

        var (distractors, _, _) = await gen.GenerateAsync(
            "fast", "en", null, null, "en", CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.True(distractors!.Count <= 5);
    }

    [Fact]
    public async Task Generate_LongDistractors_Filtered()
    {
        var longWord = new string('a', 60);
        var gen = CreateGenerator(
            $"DISTRACTORS: {longWord}, bright, sharp, narrow, gentle");

        var (distractors, _, _) = await gen.GenerateAsync(
            "fast", "en", null, null, "en", CancellationToken.None);

        Assert.NotNull(distractors);
        Assert.DoesNotContain(longWord, distractors!);
    }
}
