using Application.Ai;
using TextStack.Ai.Rag;

namespace TextStack.UnitTests;

public class RagAskPromptTests
{
    private static RetrievedChunk Chunk(int chapterOrd, string text) =>
        new(Guid.NewGuid(), Guid.NewGuid(), chapterOrd, 0, text, 0, text.Length, 0.9);

    [Fact]
    public void BuildUserPrompt_NumbersExcerptsAndAppendsQuestion()
    {
        var prompt = RagAskPrompt.BuildUserPrompt(
            "How does it work?",
            [Chunk(3, "first excerpt"), Chunk(5, "second excerpt")],
            []);

        Assert.Contains("[1] (ch.3) first excerpt", prompt);
        Assert.Contains("[2] (ch.5) second excerpt", prompt);
        Assert.Contains("Question: How does it work?", prompt);
        Assert.DoesNotContain("Your notes:", prompt);
    }

    [Fact]
    public void BuildUserPrompt_WithNotes_IncludesNotesBlock()
    {
        var prompt = RagAskPrompt.BuildUserPrompt(
            "Q?", [Chunk(1, "x")], ["my highlight", "another note"]);

        Assert.Contains("Your notes:", prompt);
        Assert.Contains("- my highlight", prompt);
        Assert.Contains("- another note", prompt);
    }

    [Fact]
    public void ParseCitations_ExtractsDistinctInOrder()
        => Assert.Equal(new[] { 2, 1 }, RagAskPrompt.ParseCitations("see [2] and [1] and [2] again", 3));

    [Fact]
    public void ParseCitations_IgnoresOutOfRange()
        => Assert.Equal(new[] { 1 }, RagAskPrompt.ParseCitations("valid [1], bogus [9]", 3));

    [Theory]
    [InlineData("no markers here")]
    [InlineData("")]
    public void ParseCitations_NoMarkers_Empty(string answer)
        => Assert.Empty(RagAskPrompt.ParseCitations(answer, 5));
}
