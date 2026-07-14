using Application.Ai;
using Application.BookChat;
using Contracts.Books;

namespace TextStack.UnitTests;

/// <summary>
/// Persistent Book Chat (feat/book-chat-history) — the pure history/memory + config helpers: conversation
/// target XOR, monotonic ord, spoiler-gate default, the summary-watermark trigger math, and the
/// server-owned history assembly (rolling summary priming exchange + clamped recent turns).
/// </summary>
public class BookChatHistoryTests
{
    private static readonly Guid A = Guid.NewGuid();
    private static readonly Guid B = Guid.NewGuid();

    // ---- target XOR (mirrors the DB CHECK) ----

    [Fact]
    public void IsValidTarget_EditionOnly_True()
        => Assert.True(BookChatHistory.IsValidTarget(A, null));

    [Fact]
    public void IsValidTarget_UserBookOnly_True()
        => Assert.True(BookChatHistory.IsValidTarget(null, B));

    [Fact]
    public void IsValidTarget_Both_False()
        => Assert.False(BookChatHistory.IsValidTarget(A, B));

    [Fact]
    public void IsValidTarget_Neither_False()
        => Assert.False(BookChatHistory.IsValidTarget(null, null));

    // ---- spoiler-gate default ----

    [Fact]
    public void DefaultSpoilerGate_Edition_On()
        => Assert.True(BookChatHistory.DefaultSpoilerGate(isEdition: true));

    [Fact]
    public void DefaultSpoilerGate_UserBook_Off()
        => Assert.False(BookChatHistory.DefaultSpoilerGate(isEdition: false));

    // ---- monotonic ord ----

    [Fact]
    public void NextOrd_EmptyConversation_IsOne()
        => Assert.Equal(1, BookChatHistory.NextOrd(null));

    [Fact]
    public void NextOrd_AfterMax_Increments()
        => Assert.Equal(8, BookChatHistory.NextOrd(7));

    // ---- summary trigger math ----

    [Fact]
    public void ShouldSummarize_GapBelowThreshold_False()
        => Assert.False(BookChatHistory.ShouldSummarize(maxOrd: 7, summarizedThroughOrd: 0));

    [Fact]
    public void ShouldSummarize_GapAtThreshold_True()
        => Assert.True(BookChatHistory.ShouldSummarize(maxOrd: 8, summarizedThroughOrd: 0));

    [Fact]
    public void ShouldSummarize_AfterPriorWatermark_UsesDelta()
    {
        // Already summarized through 6; only 8-6=2 new ords → not due yet.
        Assert.False(BookChatHistory.ShouldSummarize(maxOrd: 8, summarizedThroughOrd: 6));
        // 14-6=8 → due.
        Assert.True(BookChatHistory.ShouldSummarize(maxOrd: 14, summarizedThroughOrd: 6));
    }

    [Fact]
    public void NextWatermark_LeavesLastMaxTurnsLive()
        => Assert.Equal(8 - RagAskHistory.MaxTurns, BookChatHistory.NextWatermark(8));

    [Fact]
    public void NextWatermark_NeverNegative()
        => Assert.Equal(0, BookChatHistory.NextWatermark(3));

    // ---- history assembly ----

    [Fact]
    public void BuildHistory_NoSummary_ReturnsClampedTurnsOnly()
    {
        var turns = new List<AskTurnDto> { new("user", "q1"), new("assistant", "a1") };

        var history = BookChatHistory.BuildHistory(summary: null, turns);

        Assert.Equal(2, history.Count);
        Assert.Equal("q1", history[0].Content);
        Assert.Equal("a1", history[1].Content);
    }

    [Fact]
    public void BuildHistory_WithSummary_PrependsPrimingExchange()
    {
        var turns = new List<AskTurnDto> { new("user", "recent q") };

        var history = BookChatHistory.BuildHistory(summary: "we discussed the ending", turns);

        // priming user note + summary-as-assistant, then the clamped recent turns.
        Assert.Equal(3, history.Count);
        Assert.Equal("user", history[0].Role);
        Assert.Equal("assistant", history[1].Role);
        Assert.Equal("we discussed the ending", history[1].Content);
        Assert.Equal("recent q", history[2].Content);
    }

    [Fact]
    public void BuildHistory_ClampsRecentTurnsToLastMaxTurns()
    {
        var turns = Enumerable.Range(0, 10).Select(i => new AskTurnDto("user", $"t{i}")).ToList();

        var history = BookChatHistory.BuildHistory(summary: "s", turns);

        // 2 priming + last MaxTurns recent.
        Assert.Equal(2 + RagAskHistory.MaxTurns, history.Count);
        Assert.Equal("t4", history[2].Content);
        Assert.Equal("t9", history[^1].Content);
    }

    [Theory]
    [InlineData("   ")]
    [InlineData("")]
    public void BuildHistory_BlankSummary_NoPriming(string summary)
    {
        var history = BookChatHistory.BuildHistory(summary, [new AskTurnDto("user", "q")]);
        Assert.Single(history);
    }

    // ---- summary cap ----

    [Fact]
    public void CapSummary_UnderCap_Unchanged()
        => Assert.Equal("short", BookChatHistory.CapSummary("short"));

    [Fact]
    public void CapSummary_OverCap_Truncated()
    {
        var huge = new string('x', BookChatHistory.MaxSummaryChars + 100);
        Assert.Equal(BookChatHistory.MaxSummaryChars, BookChatHistory.CapSummary(huge).Length);
    }
}
