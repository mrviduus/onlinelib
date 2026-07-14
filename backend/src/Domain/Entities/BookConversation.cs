namespace Domain.Entities;

/// <summary>
/// A persistent "chat with this book" conversation (NotebookLM-style): ONE row per user + book, holding
/// the server-owned history so the client stays dumb (no history sent per turn). Exactly one of
/// <see cref="EditionId"/> (a catalog book) or <see cref="UserBookId"/> (the user's own upload) is set —
/// enforced by a DB CHECK. Site-scoped (ISiteScoped) like the other AI session tables. The rolling
/// <see cref="Summary"/> compresses turns older than the live window so long conversations stay in budget;
/// <see cref="SummarizedThroughOrd"/> is the high-water mark of messages already folded into it. Plain
/// POCO; EF mapping in AppDbContext.BookChat.cs.
/// </summary>
public class BookConversation : ISiteScoped
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid SiteId { get; set; }

    /// <summary>The catalog edition this chat is about — null iff this is a user-book chat.</summary>
    public Guid? EditionId { get; set; }

    /// <summary>The user's uploaded book this chat is about — null iff this is a catalog chat.</summary>
    public Guid? UserBookId { get; set; }

    /// <summary>
    /// Whether the spoiler gate applies (catalog only): when true, retrieval is capped to the user's
    /// read progress. Defaults true for catalog books, false for user books (it's their own document).
    /// </summary>
    public bool SpoilerGateEnabled { get; set; }

    /// <summary>The rolling summary of turns older than the live window; null/empty until first summarize.</summary>
    public string? Summary { get; set; }

    /// <summary>Highest message ord already folded into <see cref="Summary"/> (0 = nothing summarized).</summary>
    public int SummarizedThroughOrd { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    // Navigation
    public User User { get; set; } = null!;
    public Site Site { get; set; } = null!;
    public Edition? Edition { get; set; }
    public UserBook? UserBook { get; set; }
    public ICollection<ConversationMessage> Messages { get; set; } = new List<ConversationMessage>();
}
