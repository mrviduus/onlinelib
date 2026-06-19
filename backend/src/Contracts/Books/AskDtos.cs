namespace Contracts.Books;

/// <summary>
/// "Ask this book" request (AI-025). <see cref="K"/> overrides the default retrieval count.
/// <see cref="CurrentChapterId"/> is the chapter the reader has open right now; the spoiler gate
/// counts it as read (max with persisted progress) so "ask about what I'm reading" works before the
/// debounced progress-save fires. Resolved server-side and ignored if it isn't part of this edition.
/// </summary>
public record AskRequest(string Question, int? K = null, Guid? CurrentChapterId = null);

/// <summary>
/// A cited source for an answer. <see cref="Marker"/> is the <c>[n]</c> number in the answer text;
/// <see cref="ChapterOrd"/> + offsets deep-link the citation back into the reader.
/// </summary>
public record AskCitation(
    int Marker,
    Guid ChunkId,
    Guid ChapterId,
    int ChapterOrd,
    int CharStart,
    int CharEnd,
    string Preview);

/// <summary>
/// "Ask this book" answer. <see cref="Insufficient"/> is true when the user hasn't read enough to
/// answer (no model was called); <see cref="LastReadOrd"/> is their furthest-read chapter.
/// </summary>
public record AskResponse(
    string Answer,
    IReadOnlyList<AskCitation> Citations,
    int LastReadOrd,
    bool Insufficient);
