using Application.Ai;
using Contracts.Books;

namespace TextStack.UnitTests;

/// <summary>
/// AI-028 — multi-turn "Ask this book" history: the defensive clamp (last-6 + per-turn content cap +
/// role normalization) and the chat-message assembly order (system supplied separately → context →
/// prior turns → new question last).
/// </summary>
public class RagAskHistoryTests
{
    private static AskTurnDto User(string c) => new("user", c);
    private static AskTurnDto Assistant(string c) => new("assistant", c);

    [Fact]
    public void Clamp_Null_ReturnsEmpty() => Assert.Empty(RagAskHistory.Clamp(null));

    [Fact]
    public void Clamp_KeepsOnlyLastSixTurns()
    {
        var history = Enumerable.Range(0, 10).Select(i => User($"turn {i}")).ToList();

        var clamped = RagAskHistory.Clamp(history);

        Assert.Equal(RagAskHistory.MaxTurns, clamped.Count);
        // The LAST six survive (turns 4..9), most recent context retained.
        Assert.Equal("turn 4", clamped[0].Content);
        Assert.Equal("turn 9", clamped[^1].Content);
    }

    [Fact]
    public void Clamp_TruncatesPerTurnContent()
    {
        var huge = new string('x', RagAskHistory.MaxTurnChars + 500);

        var clamped = RagAskHistory.Clamp([User(huge)]);

        Assert.Equal(RagAskHistory.MaxTurnChars, Assert.Single(clamped).Content.Length);
    }

    [Fact]
    public void Clamp_DropsBlankAndUnknownRoles_NormalizesRole()
    {
        var clamped = RagAskHistory.Clamp(
        [
            new AskTurnDto("USER", "keep me"),
            new AskTurnDto("system", "drop: bad role"),
            new AskTurnDto("assistant", "   "),
            new AskTurnDto("Assistant", "keep assistant"),
        ]);

        Assert.Equal(2, clamped.Count);
        Assert.Equal("user", clamped[0].Role);
        Assert.Equal("keep me", clamped[0].Content);
        Assert.Equal("assistant", clamped[1].Role);
        Assert.Equal("keep assistant", clamped[1].Content);
    }

    [Fact]
    public void BuildMessages_Order_ContextThenHistoryThenQuestion()
    {
        var messages = RagAskHistory.BuildMessages(
            "CONTEXT BLOCK",
            [User("earlier question"), Assistant("earlier answer [1]")],
            "the new question");

        // [0] = context (user role), [1..n] = prior turns in order, [last] = new question (user role).
        Assert.Equal(4, messages.Count);

        Assert.Equal("user", messages[0].Role);
        Assert.Equal("CONTEXT BLOCK", messages[0].Content);

        Assert.Equal("user", messages[1].Role);
        Assert.Equal("earlier question", messages[1].Content);

        Assert.Equal("assistant", messages[2].Role);
        Assert.Equal("earlier answer [1]", messages[2].Content);

        Assert.Equal("user", messages[^1].Role);
        Assert.Equal("the new question", messages[^1].Content);
    }

    [Fact]
    public void BuildMessages_EmptyHistory_ContextThenQuestionOnly()
    {
        var messages = RagAskHistory.BuildMessages("CTX", [], "Q?");

        Assert.Equal(2, messages.Count);
        Assert.Equal("CTX", messages[0].Content);
        Assert.Equal("Q?", messages[1].Content);
    }

    [Fact]
    public void Clamp_AbusiveFlood_BoundedToLastSix_EachContentCapped()
    {
        // Malicious client: 1000 turns, each 10MB. Server-side clamp must bound both axes regardless of
        // what the client claims to send (cost / context-window defense — NOT just a UI slice).
        var huge = new string('z', 10 * 1024 * 1024);
        var flood = Enumerable.Range(0, 1000)
            .Select(i => i % 2 == 0 ? User(huge) : Assistant(huge))
            .ToList();

        var clamped = RagAskHistory.Clamp(flood);

        Assert.Equal(RagAskHistory.MaxTurns, clamped.Count);
        Assert.All(clamped, t => Assert.Equal(RagAskHistory.MaxTurnChars, t.Content.Length));
    }

    [Fact]
    public void BuildMessages_MalformedHistory_TwoUsersInARow_DoesNotThrow_PreservesOrder()
    {
        // A crafted history that doesn't alternate (two user turns, assistant-first elsewhere) must not
        // break assembly — we pass it through verbatim after the context block; the LLM tolerates it.
        var messages = RagAskHistory.BuildMessages(
            "CTX",
            [User("first"), User("second-in-a-row"), Assistant("reply")],
            "now what?");

        Assert.Equal(5, messages.Count);
        Assert.Equal("CTX", messages[0].Content);
        Assert.Equal("first", messages[1].Content);
        Assert.Equal("second-in-a-row", messages[2].Content);
        Assert.Equal("reply", messages[3].Content);
        Assert.Equal("now what?", messages[^1].Content);
    }
}
