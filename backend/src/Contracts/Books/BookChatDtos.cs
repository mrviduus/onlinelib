namespace Contracts.Books;

/// <summary>
/// One persisted turn in a Book Chat conversation, as returned by <c>GET /me/chat</c>.
/// <see cref="Citations"/> is populated for assistant turns (deserialized from the stored
/// <c>AskCitation[]</c>) so the reader can re-render citation jumps after a reload; empty for user turns.
/// </summary>
public record ChatMessageDto(
    int Ord,
    string Role,
    string Content,
    IReadOnlyList<AskCitation> Citations);

/// <summary>
/// The user's persistent conversation for one book (NotebookLM-style). Returned by <c>GET /me/chat</c>,
/// which auto-creates an empty conversation if none exists (upsert-on-read).
/// </summary>
public record ChatConversationResponse(
    Guid ConversationId,
    bool SpoilerGateEnabled,
    IReadOnlyList<ChatMessageDto> Messages);

/// <summary>
/// A new question in a Book Chat (<c>POST /me/chat/{id}/messages</c>). History is NOT sent — the server
/// owns it. <see cref="CurrentChapterId"/> is the chapter open in the reader (spoiler-gate hint, catalog
/// only; resolved server-side and ignored if not part of this book).
/// </summary>
public record ChatAskRequest(
    string Question,
    Guid? CurrentChapterId = null);

/// <summary>Toggle the spoiler gate for a conversation (<c>PATCH /me/chat/{id}</c>).</summary>
public record ChatToggleRequest(bool SpoilerGateEnabled);
