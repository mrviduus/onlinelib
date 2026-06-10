namespace TextStack.Ai.Rag;

/// <summary>
/// One retrieval-sized slice of a chapter's plain text, produced by <see cref="IChunker"/>.
/// Maps onto a <c>chapter_chunk</c> row (Phase 4 RAG). Offsets are UTF-16 code-unit indices
/// into the SAME <c>plain_text</c> string that was chunked — retrieval/citation code must
/// slice that identical string to reconstruct the chunk or expand parent context.
/// </summary>
/// <param name="Ord">0-based position of this chunk within its chapter.</param>
/// <param name="Text">The chunk's plain text (the unit that gets embedded).</param>
/// <param name="TokenCount">Exact cl100k token count of <paramref name="Text"/>.</param>
/// <param name="CharStart">Inclusive start offset of the chunk in the chapter plain text.</param>
/// <param name="CharEnd">Exclusive end offset of the chunk in the chapter plain text.</param>
public readonly record struct TextChunk(int Ord, string Text, int TokenCount, int CharStart, int CharEnd);
