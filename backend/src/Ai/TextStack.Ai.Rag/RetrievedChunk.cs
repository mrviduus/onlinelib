namespace TextStack.Ai.Rag;

/// <summary>
/// One chunk returned by <see cref="IRagService"/> vector retrieval, with its citation offsets
/// and similarity score. Offsets reference the chapter's <c>plain_text</c> (see <see cref="TextChunk"/>).
/// </summary>
/// <param name="Score">Cosine similarity in [−1, 1] (1 − cosine distance); higher is closer.</param>
public readonly record struct RetrievedChunk(
    Guid ChunkId,
    Guid ChapterId,
    int ChapterOrd,
    int Ord,
    string Text,
    int CharStart,
    int CharEnd,
    double Score);
