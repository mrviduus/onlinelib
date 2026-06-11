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

/// <summary>One retrieval golden's outcome in the admin RAG eval (AI-027a): did top-k surface it?</summary>
public record RagRecallCaseDto(string Question, int ExpectedChapterOrd, bool Hit);

/// <summary>One adversarial golden's outcome: chunks that leaked past the spoiler gate (0 = clean).</summary>
public record RagSpoilerCaseDto(string Question, int GateChapterOrd, int LeakCount);

/// <summary>
/// Result of the admin RAG retrieval eval (AI-027a): recall@k over the retrieval goldens and the
/// spoiler-leak rate over the adversarial set (DoD: recall ≥0.85, leak rate = 0), plus per-case detail.
/// </summary>
public record RagEvalDto(
    int K,
    double Recall,
    int RecallN,
    double SpoilerLeakRate,
    int SpoilerN,
    IReadOnlyList<RagRecallCaseDto> RecallCases,
    IReadOnlyList<RagSpoilerCaseDto> SpoilerCases);
