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
/// Citation-correctness summary (AI-027b): the 1–5 judge mean over cited excerpts and the support rate
/// (fraction the judge scored ≥4 on "support" — the DoD ≥0.9 metric). Null on a retrieval-only run.
/// </summary>
public record RagCitationDto(double Score, double SupportRate, int CitationsJudged, int AnswersGenerated);

/// <summary>
/// Result of the admin RAG eval (AI-027): recall@k + spoiler-leak rate (DoD: recall ≥0.85, leak = 0)
/// and, when judged (027b), citation correctness — plus per-case detail.
/// </summary>
public record RagEvalDto(
    int K,
    double Recall,
    int RecallN,
    double SpoilerLeakRate,
    int SpoilerN,
    RagCitationDto? Citation,
    IReadOnlyList<RagRecallCaseDto> RecallCases,
    IReadOnlyList<RagSpoilerCaseDto> SpoilerCases);
