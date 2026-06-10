using TextStack.Ai.Rag;

namespace TextStack.UnitTests;

public class ChunkerTests
{
    // ---- SplitSentences (pure, no tokenizer) ----

    [Fact]
    public void SplitSentences_MultipleSentences_PreservesOffsets()
    {
        const string text = "Hello world. How are you? Fine!";
        var sentences = Chunker.SplitSentences(text);

        Assert.Equal(3, sentences.Count);
        // Every span's offsets must slice back to its exact text.
        foreach (var s in sentences)
            Assert.Equal(s.Text, text.Substring(s.Start, s.End - s.Start));
        // Offsets are strictly increasing.
        Assert.True(sentences[0].End <= sentences[1].Start);
        Assert.True(sentences[1].End <= sentences[2].Start);
    }

    [Fact]
    public void SplitSentences_TrailingFragmentWithoutTerminator_IsCaptured()
    {
        const string text = "First sentence. Second has no period";
        var sentences = Chunker.SplitSentences(text);

        Assert.Equal(2, sentences.Count);
        Assert.Equal("Second has no period", sentences[1].Text);
        Assert.Equal(text.Length, sentences[1].End);
    }

    [Fact]
    public void SplitSentences_ClosingQuoteAfterTerminator_IncludedInSpan()
    {
        const string text = "He said \"hello.\" Bye.";
        var sentences = Chunker.SplitSentences(text);

        Assert.Equal(2, sentences.Count);
        Assert.EndsWith("\"", sentences[0].Text); // closing quote stays with first sentence
        Assert.Equal(sentences[0].Text, text.Substring(sentences[0].Start, sentences[0].End - sentences[0].Start));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   \n\t ")]
    public void SplitSentences_BlankInput_ReturnsEmpty(string text)
        => Assert.Empty(Chunker.SplitSentences(text));

    // ---- Chunk (uses the real tiktoken vocab) ----

    private const string Paragraph =
        "Alpha beta gamma delta. Epsilon zeta eta theta. Iota kappa lambda mu. " +
        "Nu xi omicron pi. Rho sigma tau upsilon.";

    [Theory]
    [InlineData("")]
    [InlineData("    ")]
    public void Chunk_BlankInput_ReturnsEmpty(string text)
        => Assert.Empty(new Chunker().Chunk(text));

    [Fact]
    public void Chunk_ShortText_ReturnsSingleChunkSpanningText()
    {
        const string text = "Just one short sentence here.";
        var chunks = new Chunker().Chunk(text);

        var chunk = Assert.Single(chunks);
        Assert.Equal(0, chunk.Ord);
        Assert.Equal(text, chunk.Text);
        Assert.Equal(text, text.Substring(chunk.CharStart, chunk.CharEnd - chunk.CharStart));
        Assert.True(chunk.TokenCount > 0);
    }

    [Fact]
    public void Chunk_LongText_OffsetsAlwaysSliceBackToChunkText()
    {
        var chunks = new Chunker(maxTokens: 12, overlapTokens: 4).Chunk(Paragraph);

        Assert.True(chunks.Count >= 2);
        foreach (var c in chunks)
            Assert.Equal(c.Text, Paragraph.Substring(c.CharStart, c.CharEnd - c.CharStart));
    }

    [Fact]
    public void Chunk_MultipleChunks_OrdIsZeroBasedContiguous()
    {
        var chunks = new Chunker(maxTokens: 12, overlapTokens: 4).Chunk(Paragraph);

        for (var i = 0; i < chunks.Count; i++)
            Assert.Equal(i, chunks[i].Ord);
    }

    [Fact]
    public void Chunk_WithOverlap_ConsecutiveChunksShareText()
    {
        // Overlap budget must clear one sentence (~5 tokens) for any to be re-included;
        // production's 64-token overlap clears whole sentences comfortably.
        var chunks = new Chunker(maxTokens: 20, overlapTokens: 10).Chunk(Paragraph);

        Assert.True(chunks.Count >= 2);
        // Overlap means a later chunk starts before the previous one ends, at least once.
        var sawOverlap = false;
        for (var i = 1; i < chunks.Count; i++)
        {
            Assert.True(chunks[i].CharStart <= chunks[i - 1].CharEnd); // never a gap
            if (chunks[i].CharStart < chunks[i - 1].CharEnd) sawOverlap = true;
        }
        Assert.True(sawOverlap);
    }

    [Fact]
    public void Chunk_RespectsTokenBudget_WithinTolerance()
    {
        const int max = 12;
        var chunks = new Chunker(maxTokens: max, overlapTokens: 4).Chunk(Paragraph);

        // Per-sentence packing bounds the window; joining whitespace can add a token or two.
        foreach (var c in chunks)
            Assert.True(c.TokenCount <= max + 3, $"chunk {c.Ord} had {c.TokenCount} tokens");
    }

    [Fact]
    public void Chunk_SingleSentenceOverBudget_EmittedAsOneChunk()
    {
        // One sentence (no terminator) far larger than the budget.
        var huge = string.Join(' ', Enumerable.Range(0, 80).Select(i => $"word{i}"));
        var chunks = new Chunker(maxTokens: 10, overlapTokens: 2).Chunk(huge);

        var chunk = Assert.Single(chunks);
        Assert.True(chunk.TokenCount > 10); // not split mid-sentence
        Assert.Equal(huge, chunk.Text);
    }
}
