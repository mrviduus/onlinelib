namespace TextStack.Ai.Rag;

/// <summary>
/// Splits a chapter's plain text into sentence-aware, token-bounded chunks for embedding.
/// Implementations are stateless and thread-safe (the tokenizer is built once and reused).
/// </summary>
public interface IChunker
{
    /// <summary>
    /// Chunk <paramref name="plainText"/> into ordered, overlapping windows. Returns an empty
    /// list for null/whitespace input. Chunk offsets reference <paramref name="plainText"/>.
    /// </summary>
    IReadOnlyList<TextChunk> Chunk(string plainText);
}
