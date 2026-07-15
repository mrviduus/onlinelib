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
    public void BuildSystemPrompt_TutorRegister_EncouragesAdaptiveMarkdownStructure()
    {
        // The register moved from "keep it short, no markdown" (fiction companion) to study/tutor:
        // markdown structure is ENCOURAGED for explain/summarize questions, while a simple lookup stays
        // short. Lock in that the anti-markdown instruction is gone and structure guidance is present.
        var system = RagAskPrompt.BuildSystemPrompt();

        Assert.DoesNotContain("No markdown", system);
        Assert.DoesNotContain("Keep replies short", system);
        Assert.Contains("markdown", system, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("summarize", system, StringComparison.OrdinalIgnoreCase);
        // Adaptive length: a simple lookup still stays brief.
        Assert.Contains("2-4 sentences", system);
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

    [Fact]
    public void ParseCitations_MarkdownWrappedMarkers_StillParse()
    {
        // Tutor answers wrap markers in markdown — bold, headings, list items. The marker itself is
        // untouched, so parsing must be unaffected.
        const string answer = "## Summary\n- **The heap grows [2]** while the stack shrinks.\n1. Then `free()` runs [1].";
        Assert.Equal(new[] { 2, 1 }, RagAskPrompt.ParseCitations(answer, 3));
    }

    [Theory]
    [InlineData("Both hold [1, 2].", new[] { 1, 2 })]
    [InlineData("Grouped [1;3] and single [2].", new[] { 1, 3, 2 })]
    public void ParseCitations_GroupedMarkers_ExpandDistinctInOrder(string answer, int[] expected)
        => Assert.Equal(expected, RagAskPrompt.ParseCitations(answer, 3));

    [Fact]
    public void ParseCitations_MarkdownLink_NotTreatedAsCitation()
        // A markdown link "[see](url)" has non-digit bracket content → must not parse as a citation.
        => Assert.Empty(RagAskPrompt.ParseCitations("check [the docs](http://x) here", 5));

    [Theory]
    [InlineData("Summarize chapter 5")]
    [InlineData("give me an overview of the plot")]
    [InlineData("what are the key points so far")]
    [InlineData("what is chapter 3 about?")]
    [InlineData("TL;DR please")]
    [InlineData("о чём глава 2")]
    public void IsOverviewQuestion_OverviewClass_True(string question)
        => Assert.True(RagAskPrompt.IsOverviewQuestion(question));

    [Theory]
    [InlineData("Who killed the duke?")]
    [InlineData("What does 'entropy' mean here?")]
    [InlineData("Where does Anna go after the ball?")]
    [InlineData("")]
    [InlineData(null)]
    public void IsOverviewQuestion_PinpointOrEmpty_False(string? question)
        => Assert.False(RagAskPrompt.IsOverviewQuestion(question));

    // ---- target-chapter parsing (Fix #6) -------------------------------------------------------------

    [Theory]
    [InlineData("Summarize chapter 5", 5)]
    [InlineData("summarize Chapter 12 please", 12)]
    [InlineData("what is ch. 3 about?", 3)]
    [InlineData("recap ch 7", 7)]
    [InlineData("overview of chapter: 9", 9)]
    [InlineData("о чём глава 2", 2)]
    public void TryParseTargetChapter_NamedChapter_ReturnsNumber(string question, int expected)
        => Assert.Equal(expected, RagAskPrompt.TryParseTargetChapter(question));

    [Theory]
    [InlineData("summarize the book")]
    [InlineData("give me the main idea")]
    [InlineData("what are the key points so far")]
    [InlineData("")]
    [InlineData(null)]
    public void TryParseTargetChapter_NoNamedChapter_ReturnsNull(string? question)
        => Assert.Null(RagAskPrompt.TryParseTargetChapter(question));

    [Fact]
    public void ResolveSummarySpec_Pinpoint_IsNone()
    {
        var spec = RagAskPrompt.ResolveSummarySpec("Who killed the duke?");
        Assert.False(spec.Include);
        Assert.Null(spec.TargetChapterOrd);
    }

    [Fact]
    public void ResolveSummarySpec_OverviewNoChapter_IncludesAllSummaries()
    {
        var spec = RagAskPrompt.ResolveSummarySpec("give me an overview of the plot");
        Assert.True(spec.Include);
        Assert.Null(spec.TargetChapterOrd); // All: every summary eligible, capped at k/2 downstream
    }

    [Fact]
    public void ResolveSummarySpec_OverviewNamingChapter_TargetsThatChapter()
    {
        var spec = RagAskPrompt.ResolveSummarySpec("summarize chapter 5");
        Assert.True(spec.Include);
        Assert.Equal(5, spec.TargetChapterOrd);
    }
}
