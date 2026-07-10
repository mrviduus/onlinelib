namespace TextStack.Ai.Rag;

/// <summary>
/// One chunk returned by <see cref="IRagService"/> vector retrieval, with its citation offsets
/// and similarity score. Offsets reference the chapter's <c>plain_text</c> (see <see cref="TextChunk"/>).
/// </summary>
/// <param name="Score">
/// Retrieval score, higher = more relevant. The RRF fusion score (AI-023) when hybrid retrieval
/// runs — a small positive number, NOT comparable to a raw cosine similarity or threshold.
/// </param>
/// <param name="ChapterId">
/// The source chapter id. NULLABLE since ADR-012 S3: a vision-parsed PDF chunk may not be anchored to
/// any chapter (chapter detection is best-effort) — <c>user_chapter_id</c> is now nullable.
/// </param>
/// <param name="SourcePage">
/// ADR-012 S3: the 1-based physical PDF page this chunk starts on (null for EPUB/catalog chunks). Drives
/// the "p. {n}" citation and the jump-to-page in the Original viewer.
/// </param>
/// <param name="SectionPath">
/// ADR-012 S3: the Markdown heading breadcrumb this chunk falls under (null at root / for EPUB chunks).
/// </param>
public readonly record struct RetrievedChunk(
    Guid ChunkId,
    Guid? ChapterId,
    int ChapterOrd,
    int Ord,
    string Text,
    int CharStart,
    int CharEnd,
    double Score,
    int? SourcePage = null,
    string? SectionPath = null);
