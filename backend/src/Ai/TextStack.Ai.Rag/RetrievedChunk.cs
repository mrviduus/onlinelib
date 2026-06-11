namespace TextStack.Ai.Rag;

/// <summary>
/// One chunk returned by <see cref="IRagService"/> vector retrieval, with its citation offsets
/// and similarity score. Offsets reference the chapter's <c>plain_text</c> (see <see cref="TextChunk"/>).
/// </summary>
/// <param name="Score">
/// Retrieval score, higher = more relevant. The RRF fusion score (AI-023) when hybrid retrieval
/// runs — a small positive number, NOT comparable to a raw cosine similarity or threshold.
/// </param>
public readonly record struct RetrievedChunk(
    Guid ChunkId,
    Guid ChapterId,
    int ChapterOrd,
    int Ord,
    string Text,
    int CharStart,
    int CharEnd,
    double Score);
