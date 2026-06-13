using Application.Ai;
using TextStack.Ai.EvalSuite;

namespace TextStack.AiEvals;

/// <summary>
/// AI-033 — the deterministic pre-router, validated against the ENTIRE golden set in CI: every
/// no-tool golden must trigger nothing (so production physically cannot over-call on them — that
/// floor is 15/15 by construction), and every tool golden must have its expected tool among the
/// triggered set. This is the deterministic half of the accuracy gate; the model only decides the
/// remainder (offered-tool → call it with the right args).
/// </summary>
public class ExplainToolTriggersTests
{
    private static readonly IReadOnlyList<ToolCallGolden> Goldens = ToolCallGoldenSet.Load();

    [Fact]
    public void NoToolGoldens_TriggerNothing()
    {
        var noTool = Goldens.Where(g => g.ExpectedTool is null).ToList();
        Assert.NotEmpty(noTool);
        Assert.All(noTool, g =>
            Assert.Empty(ExplainToolTriggers.TriggeredTools(g.Sentence, hasUser: true)));
    }

    [Fact]
    public void ToolGoldens_TriggerTheirExpectedTool()
    {
        var withTool = Goldens.Where(g => g.ExpectedTool is not null).ToList();
        Assert.NotEmpty(withTool);
        Assert.All(withTool, g =>
            Assert.Contains(g.ExpectedTool!, ExplainToolTriggers.TriggeredTools(g.Sentence, hasUser: true)));
    }

    [Fact]
    public void HighlightsTrigger_RequiresSignedInUser()
    {
        var highlightGolden = Goldens.First(g => g.ExpectedTool == "get_user_highlights");
        Assert.DoesNotContain("get_user_highlights",
            ExplainToolTriggers.TriggeredTools(highlightGolden.Sentence, hasUser: false));
    }

    [Theory]
    [InlineData("Replication keeps a copy of the same data on multiple machines.")]
    [InlineData("This was a long chapter about many things.")] // "chapter" without a number
    [InlineData("Earlier adopters of NoSQL hit this problem.")] // "earlier" without discussed/mentioned
    public void PlainSentences_TriggerNothing(string sentence)
        => Assert.Empty(ExplainToolTriggers.TriggeredTools(sentence, hasUser: true));
}
