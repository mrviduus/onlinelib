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

/// <summary>One synthesised grounding probe's outcome in the user-book eval (P1): citation count + refusal.</summary>
public record UserBookProbeDto(string Question, int Citations, bool Insufficient);

/// <summary>One behaviour probe's outcome (greeting | off_book) with a short pass/fail note.</summary>
public record UserBookBehaviorDto(string Kind, string Question, bool Pass, string Note);

/// <summary>
/// Result of the user-book RAG eval (P1): citation correctness over the generated grounding probes, the
/// fraction of probes that retrieved ≥1 chunk, the combined greeting+off-book behaviour pass-fraction,
/// and per-probe detail. <see cref="Citation"/> is null + <see cref="Note"/> set when the book has no
/// indexed chunks (empty short-circuit — no LLM call made).
/// </summary>
public record UserBookRagEvalDto(
    RagCitationDto? Citation,
    double Retrieval,
    int ProbeN,
    double BehaviorPass,
    IReadOnlyList<UserBookProbeDto> Probes,
    IReadOnlyList<UserBookBehaviorDto> Behavior,
    string? Note);

/// <summary>One transcribed page's outcome in the PDF vision-RAG eval (ADR-012 S3): the fidelity judge
/// score (1–5) and whether its golden table survived structure-aware chunking whole.</summary>
public record PdfVisionPageDto(int Page, bool Transcribed, double JudgeScore, bool TableSurvived);

/// <summary>One Q&amp;A's outcome: the answer-fidelity judge score (1–5), whether the answer cited the
/// expected page, the page(s) it did cite, and whether the Ask path declined for lack of context.</summary>
public record PdfVisionQaDto(
    string Question, int ExpectedPage, double AnswerScore, bool CitedExpectedPage, IReadOnlyList<int> CitedPages, bool Insufficient);

/// <summary>
/// Result of the PDF vision-RAG eval (ADR-012 S3) — the four DoD axes: transcription fidelity (≥4.0),
/// answer fidelity (≥4.0), page-citation fraction (≥0.8), table-structure survival (=1.0) — plus per-page
/// and per-question detail. <see cref="Note"/> is set only on the empty-transcription short-circuit.
/// </summary>
public record PdfVisionEvalDto(
    double Transcription,
    double Answer,
    double Citation,
    double TableStructure,
    int PageN,
    int QaN,
    IReadOnlyList<PdfVisionPageDto> Pages,
    IReadOnlyList<PdfVisionQaDto> Questions,
    string? Note);
