namespace Contracts.Admin;

/// <summary>
/// One retrieved chunk for the admin RAG debug endpoint — score + citation locators + a text
/// preview (full text is large). Mirrors the retrieval result, minus the raw embedding.
/// </summary>
public record RagChunkDto(
    Guid ChunkId,
    Guid ChapterId,
    int ChapterOrd,
    int Ord,
    double Score,
    int CharStart,
    int CharEnd,
    string TextPreview);
