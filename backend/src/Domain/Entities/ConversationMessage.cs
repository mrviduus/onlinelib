namespace Domain.Entities;

/// <summary>
/// One turn in a persistent <see cref="BookConversation"/>. <see cref="Ord"/> is a server-computed
/// monotonic sequence within the conversation (never client-supplied). Assistant turns carry
/// <see cref="CitationsJson"/> — the serialized <c>AskCitation[]</c> so citation jumps survive a reload
/// (identical shape to what the ask endpoints return live). Plain POCO; EF mapping in AppDbContext.BookChat.cs.
/// </summary>
public class ConversationMessage
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }

    /// <summary>Monotonic position within the conversation (server-assigned; first message is 1).</summary>
    public int Ord { get; set; }

    /// <summary>"user" or "assistant".</summary>
    public required string Role { get; set; }

    public required string Content { get; set; }

    /// <summary>Assistant turns: the <c>AskCitation[]</c> as jsonb; null for user turns / uncited answers.</summary>
    public string? CitationsJson { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    // Navigation
    public BookConversation Conversation { get; set; } = null!;

    public const string RoleUser = "user";
    public const string RoleAssistant = "assistant";
}
