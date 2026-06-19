using Application.Ai;
using TextStack.Ai.Rag;

namespace TextStack.UnitTests;

public class RagAskPromptTests
{
    private static RetrievedChunk Chunk(int chapterOrd, string text) =>
        new(Guid.NewGuid(), Guid.NewGuid(), chapterOrd, 0, text, 0, text.Length, 0.9);

    [Fact]
    public void BuildContextBlock_NumbersExcerpts_NoQuestionEmbedded()
    {
        // The question is the final user message in the multi-turn assembly — it must NOT be baked
        // into the context block.
        var block = RagAskPrompt.BuildContextBlock(
            [Chunk(3, "first excerpt"), Chunk(5, "second excerpt")],
            []);

        Assert.Contains("[1] (ch.3) first excerpt", block);
        Assert.Contains("[2] (ch.5) second excerpt", block);
        Assert.DoesNotContain("Question:", block);
        Assert.DoesNotContain("reader's own notes", block);
    }

    [Fact]
    public void BuildContextBlock_WithNotes_IncludesNotesBlock()
    {
        var block = RagAskPrompt.BuildContextBlock([Chunk(1, "x")], ["my highlight", "another note"]);

        Assert.Contains("reader's own notes", block);
        Assert.Contains("- my highlight", block);
        Assert.Contains("- another note", block);
    }

    [Fact]
    public void BuildSystemPrompt_Companion_GreetingBranchHasNoForcedCitation()
    {
        // Structural: the warm-companion prompt steers greeting/meta to NOT cite and NOT refuse, while
        // still REQUIRING [n] citations for any book fact (grounding contract preserved).
        var system = RagAskPrompt.BuildSystemPrompt();

        // Greeting/meta branch: warm + invite, explicitly no citation, no "excerpts lack the answer".
        Assert.Contains("greet", system, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("do NOT cite", system);

        // Grounding contract still present: book facts must come from excerpts and cite [n].
        Assert.Contains("[n]", system);
        Assert.Contains("MUST", system);
        Assert.Contains("outside knowledge", system);
    }

    [Fact]
    public void BuildSystemPrompt_Grounding_DominatesAndCoversInterpretation()
    {
        // The #1 hallucination gate: the companion may be conversational, but grounding must dominate
        // and must cover NOT just literal plot facts but theme / meaning / interpretation — otherwise the
        // model "explains the symbolism" from world knowledge with no citation. Lock that wording in.
        var system = RagAskPrompt.BuildSystemPrompt();

        Assert.Contains("ONLY source", system, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("interpret", system, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("theme", system, StringComparison.OrdinalIgnoreCase);
        // Grounding is declared as overriding the conversational tone, not co-equal with it.
        Assert.Contains("overrides", system, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void BuildSystemPrompt_GreetingExceptionIsNarrow_NotABlanketNoCiteLicense()
    {
        // The no-cite exception must be scoped to greeting / "what can you do" ONLY — never a blanket
        // "you may answer without excerpts". If this assertion ever fails because the exception widened,
        // the spoiler/hallucination gate has a hole.
        var system = RagAskPrompt.BuildSystemPrompt();

        Assert.Contains("ONLY messages you may answer without citing", system, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("you may answer without excerpts", system, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void BuildSystemPrompt_Companion_GracefulMissForContentQuestions()
    {
        // Genuine content question with no relevant excerpt → graceful "I don't see that", never invent.
        var system = RagAskPrompt.BuildSystemPrompt();

        Assert.Contains("don't see", system, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("invent", system, StringComparison.OrdinalIgnoreCase);
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
