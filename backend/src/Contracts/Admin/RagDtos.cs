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

/// <summary>A user's own highlight/note returned as guaranteed private-corpus context (AI-024).</summary>
public record PrivateNoteDto(Guid? ChapterId, int ChapterOrd, string Kind, string TextPreview);

/// <summary>
/// Spoiler-safe RAG context for the admin <c>/context</c> debug endpoint: the user's last-read
/// chapter ordinal, the gated chunks, and their private corpus.
/// </summary>
public record RagContextDto(
    int LastReadOrd,
    IReadOnlyList<RagChunkDto> Chunks,
    IReadOnlyList<PrivateNoteDto> Notes);
