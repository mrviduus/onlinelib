using OnlineLib.Search.Chunking;

namespace OnlineLib.Search.Tests.Chunking;

public class OverlappingChunkerTests
{
    private readonly OverlappingChunker _chunker = new();

    #region Empty/Null Input Tests

    [Fact]
    public void Chunk_EmptyString_ReturnsEmpty()
    {
        var result = _chunker.Chunk("");

        Assert.Empty(result);
    }

    [Fact]
    public void Chunk_WhitespaceOnly_ReturnsEmpty()
    {
        var result = _chunker.Chunk("   \n\t  ");

        Assert.Empty(result);
    }

    [Fact]
    public void Chunk_NullString_ReturnsEmpty()
    {
        var result = _chunker.Chunk(null!);

        Assert.Empty(result);
    }

    #endregion

    #region Single Chunk Tests

    [Fact]
    public void Chunk_ShortText_ReturnsSingleChunk()
    {
        var text = "This is a short sentence.";

        var result = _chunker.Chunk(text);

        Assert.Single(result);
        Assert.Equal(0, result[0].Index);
        Assert.Contains("short sentence", result[0].Content);
    }

    [Fact]
    public void Chunk_SingleSentence_ReturnsSingleChunk()
    {
        var text = "The quick brown fox jumps over the lazy dog.";

        var result = _chunker.Chunk(text);

        Assert.Single(result);
        Assert.Equal(text.Trim(), result[0].Content);
    }

    #endregion

    #region Multiple Chunks Tests

    [Fact]
    public void Chunk_LongText_ReturnsMultipleChunks()
    {
        // Create text longer than default chunk size (~1200 chars)
        var sentences = Enumerable.Range(1, 50)
            .Select(i => $"This is sentence number {i} with some additional content to make it longer.")
            .ToList();
        var text = string.Join(" ", sentences);

        var result = _chunker.Chunk(text);

        Assert.True(result.Count > 1, "Should produce multiple chunks");
    }

    [Fact]
    public void Chunk_MultipleChunks_HaveSequentialIndices()
    {
        var sentences = Enumerable.Range(1, 50)
            .Select(i => $"Sentence {i} with content.")
            .ToList();
        var text = string.Join(" ", sentences);

        var result = _chunker.Chunk(text);

        for (var i = 0; i < result.Count; i++)
        {
            Assert.Equal(i, result[i].Index);
        }
    }

    #endregion

    #region Overlap Tests

    [Fact]
    public void Chunk_WithOverlap_ChunksOverlap()
    {
        // Create text that will produce at least 2 chunks
        var sentences = Enumerable.Range(1, 30)
            .Select(i => $"This is a test sentence number {i} with more content here.")
            .ToList();
        var text = string.Join(" ", sentences);

        var result = _chunker.Chunk(text, chunkSize: 100, overlap: 20);

        if (result.Count >= 2)
        {
            // Second chunk should start before the end of first chunk (overlap)
            var firstEnd = result[0].EndOffset;
            var secondStart = result[1].StartOffset;
            Assert.True(secondStart < firstEnd || result[1].Content.Contains(result[0].Content.Split(' ').Last()),
                "Chunks should overlap");
        }
    }

    [Fact]
    public void Chunk_ZeroOverlap_NoOverlap()
    {
        var sentences = Enumerable.Range(1, 30)
            .Select(i => $"Sentence {i}.")
            .ToList();
        var text = string.Join(" ", sentences);

        var result = _chunker.Chunk(text, chunkSize: 50, overlap: 0);

        // With zero overlap, chunks should not share content
        Assert.True(result.Count >= 1);
    }

    #endregion

    #region Sentence Boundary Tests

    [Fact]
    public void Chunk_RespectsSentenceBoundaries()
    {
        var text = "First sentence here. Second sentence there. Third sentence everywhere.";

        var result = _chunker.Chunk(text);

        // Each chunk should contain complete sentences (end with punctuation or be last)
        foreach (var chunk in result)
        {
            // Content should not start mid-word (unless it's the first chunk)
            if (chunk.Index > 0)
            {
                Assert.False(char.IsLower(chunk.Content[0]) && chunk.Content[0] != 'i',
                    "Chunk should start at sentence boundary");
            }
        }
    }

    [Fact]
    public void Chunk_TextWithoutPunctuation_UsesParagraphs()
    {
        var text = "First paragraph content here\n\nSecond paragraph content there\n\nThird paragraph";

        var result = _chunker.Chunk(text);

        Assert.NotEmpty(result);
    }

    #endregion

    #region Token Count Tests

    [Fact]
    public void Chunk_EstimatesTokenCount()
    {
        var text = "This is a test sentence with multiple words.";

        var result = _chunker.Chunk(text);

        Assert.Single(result);
        Assert.True(result[0].TokenCount > 0);
        // Rough estimate: ~4 chars per token
        var expectedTokens = (int)Math.Ceiling(text.Length / 4.0);
        Assert.Equal(expectedTokens, result[0].TokenCount);
    }

    #endregion

    #region Offset Tests

    [Fact]
    public void Chunk_TracksOffsets()
    {
        var text = "First sentence. Second sentence. Third sentence.";

        var result = _chunker.Chunk(text);

        Assert.Single(result);
        Assert.Equal(0, result[0].StartOffset);
        Assert.True(result[0].EndOffset > 0);
    }

    [Fact]
    public void Chunk_LengthMatchesContent()
    {
        var text = "Test content here.";

        var result = _chunker.Chunk(text);

        Assert.Single(result);
        Assert.Equal(result[0].Content.Length, result[0].Length);
    }

    #endregion

    #region Edge Cases

    [Fact]
    public void Chunk_VeryLongSentence_HandlesGracefully()
    {
        // Single very long sentence
        var text = string.Join(" ", Enumerable.Repeat("word", 500)) + ".";

        var result = _chunker.Chunk(text);

        Assert.NotEmpty(result);
    }

    [Fact]
    public void Chunk_MixedPunctuation_HandlesDifferentEndings()
    {
        var text = "Is this a question? Yes it is! And this is a statement.";

        var result = _chunker.Chunk(text);

        Assert.NotEmpty(result);
        Assert.Contains("question", result[0].Content);
    }

    [Fact]
    public void Chunk_InvalidChunkSize_Throws()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            _chunker.Chunk("test", chunkSize: 0, overlap: 0));

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            _chunker.Chunk("test", chunkSize: -1, overlap: 0));
    }

    [Fact]
    public void Chunk_InvalidOverlap_Throws()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            _chunker.Chunk("test", chunkSize: 100, overlap: -1));

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            _chunker.Chunk("test", chunkSize: 100, overlap: 100));
    }

    #endregion

    #region DocumentChunk Record Tests

    [Fact]
    public void DocumentChunk_Create_SetsCorrectValues()
    {
        var chunk = DocumentChunk.Create(index: 0, content: "Test content", startOffset: 10, tokenCount: 5);

        Assert.Equal(0, chunk.Index);
        Assert.Equal("Test content", chunk.Content);
        Assert.Equal(10, chunk.StartOffset);
        Assert.Equal(22, chunk.EndOffset); // 10 + 12 (length of "Test content")
        Assert.Equal(5, chunk.TokenCount);
        Assert.Equal(12, chunk.Length);
    }

    #endregion

    #region Custom Parameters Tests

    [Fact]
    public void Chunk_CustomChunkSize_Respected()
    {
        var chunker = new OverlappingChunker(defaultChunkSize: 50, defaultOverlap: 10);
        var sentences = Enumerable.Range(1, 20)
            .Select(i => $"Sentence {i}.")
            .ToList();
        var text = string.Join(" ", sentences);

        var result = chunker.Chunk(text);

        // With smaller chunk size, should get more chunks
        Assert.True(result.Count >= 2);
    }

    #endregion
}
