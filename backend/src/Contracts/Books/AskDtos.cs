namespace Contracts.Books;

/// <summary>
/// One prior turn in a multi-turn "Ask this book" conversation. <see cref="Role"/> is "user" or
/// "assistant". History is sent by the client (the server is stateless); it's clamped server-side
/// (last few turns, each content-capped) before reaching the LLM.
/// </summary>
public record AskTurnDto(string Role, string Content);

/// <summary>
/// "Ask this book" request (AI-025). <see cref="K"/> overrides the default retrieval count.
/// <see cref="CurrentChapterId"/> is the chapter the reader has open right now; the spoiler gate
/// counts it as read (max with persisted progress) so "ask about what I'm reading" works before the
/// debounced progress-save fires. Resolved server-side and ignored if it isn't part of this edition.
/// <see cref="History"/> carries the prior conversation turns for multi-turn memory (AI-028);
/// retrieval still runs on <see cref="Question"/> only.
/// </summary>
public record AskRequest(
    string Question,
    int? K = null,
    Guid? CurrentChapterId = null,
    IReadOnlyList<AskTurnDto>? History = null);

/// <summary>
/// A cited source for an answer. <see cref="Marker"/> is the <c>[n]</c> number in the answer text;
/// <see cref="ChapterOrd"/> + offsets deep-link the citation back into the reader.
/// ADR-012 S3: <see cref="ChapterId"/>/<see cref="ChapterOrd"/> are nullable — a vision-parsed PDF
/// citation may not be chapter-anchored; it jumps via <see cref="SourcePage"/> into the Original viewer
/// instead, and <see cref="SectionPath"/> is the human-readable heading breadcrumb.
/// </summary>
public record AskCitation(
    int Marker,
    Guid ChunkId,
    Guid? ChapterId,
    int? ChapterOrd,
    int CharStart,
    int CharEnd,
    string Preview,
    int? SourcePage = null,
    string? SectionPath = null);

/// <summary>
/// "Ask this book" answer. <see cref="Insufficient"/> is true when the user hasn't read enough to
/// answer (no model was called); <see cref="LastReadOrd"/> is their furthest-read chapter.
/// </summary>
public record AskResponse(
    string Answer,
    IReadOnlyList<AskCitation> Citations,
    int LastReadOrd,
    bool Insufficient);
