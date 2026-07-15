using Application.Ai;

namespace TextStack.UnitTests;

/// <summary>
/// Pure-helper coverage for precomputed per-chapter RAG summaries ("S2"): the input clamp (bounds cost)
/// and the stored chunk-text prefix (makes the row lexically self-describing + citation-friendly). The
/// LLM call itself lives in <c>ChapterSummarizer</c> and is exercised live on prod.
/// </summary>
public class ChapterSummaryPromptTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   \n\t ")]
    public void Clamp_BlankInput_ReturnsEmpty(string? input)
    {
        Assert.Equal(string.Empty, ChapterSummaryPrompt.Clamp(input));
    }

    [Fact]
    public void Clamp_ShortText_ReturnsTrimmedWhole()
    {
        Assert.Equal("hello world", ChapterSummaryPrompt.Clamp("  hello world  "));
    }

    [Fact]
    public void Clamp_LongText_TruncatesToMaxInputChars()
    {
        var input = new string('a', ChapterSummaryPrompt.MaxInputChars + 500);

        var clamped = ChapterSummaryPrompt.Clamp(input);

        Assert.Equal(ChapterSummaryPrompt.MaxInputChars, clamped.Length);
    }

    [Fact]
    public void BuildUserPrompt_DelegatesToClamp()
    {
        var input = new string('b', ChapterSummaryPrompt.MaxInputChars + 10);
        Assert.Equal(ChapterSummaryPrompt.Clamp(input), ChapterSummaryPrompt.BuildUserPrompt(input));
    }

    [Fact]
    public void BuildSummaryChunkText_WithTitle_PrefixesMarkerLine()
    {
        var text = ChapterSummaryPrompt.BuildSummaryChunkText(5, "The Cache", "Evicts the LRU entry.");

        Assert.Equal("Summary of Chapter 5 — The Cache:\nEvicts the LRU entry.", text);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void BuildSummaryChunkText_BlankTitle_OmitsDash(string? title)
    {
        var text = ChapterSummaryPrompt.BuildSummaryChunkText(3, title, "Some body.");

        Assert.Equal("Summary of Chapter 3:\nSome body.", text);
    }

    [Fact]
    public void BuildSummaryChunkText_TrimsTitleAndSummary()
    {
        var text = ChapterSummaryPrompt.BuildSummaryChunkText(1, "  Intro  ", "  Body.  ");

        Assert.Equal("Summary of Chapter 1 — Intro:\nBody.", text);
    }

    [Fact]
    public void SystemPrompt_AsksForFaithfulBoundedProse()
    {
        var prompt = ChapterSummaryPrompt.BuildSystemPrompt();

        // Faithful (grounded), bounded length, plain prose — the three load-bearing constraints.
        Assert.Contains("150-250 words", prompt);
        Assert.Contains("only what the chapter text actually says", prompt);
        Assert.Contains("no preamble", prompt);
    }
}
