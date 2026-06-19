using Contracts.Books;
using TextStack.Ai.Core;

namespace Application.Ai;

/// <summary>
/// Multi-turn "Ask this book" history handling (AI-028). The server is stateless — the client sends
/// the prior conversation on each request — so this clamps the untrusted history (last N turns, each
/// content-capped) and assembles the final <see cref="LlmMessage"/> sequence: the grounded excerpts/
/// context block, then the clamped prior turns, then the new question last. Pure so it's unit-tested.
/// </summary>
public static class RagAskHistory
{
    /// <summary>How many trailing turns of history survive the clamp (defense against unbounded prompts).</summary>
    public const int MaxTurns = 6;

    /// <summary>Per-turn content cap in chars (a single pasted turn can't blow the prompt budget).</summary>
    public const int MaxTurnChars = 4000;

    private const string UserRole = "user";
    private const string AssistantRole = "assistant";

    /// <summary>
    /// Defensive clamp over untrusted client history: drops blank/unknown-role turns, keeps only the
    /// LAST <see cref="MaxTurns"/> turns, and truncates each turn's content to <see cref="MaxTurnChars"/>.
    /// Roles are normalized to "user"/"assistant" (anything else is dropped).
    /// </summary>
    public static IReadOnlyList<AskTurnDto> Clamp(IReadOnlyList<AskTurnDto>? history)
    {
        if (history is null || history.Count == 0)
            return [];

        var cleaned = new List<AskTurnDto>(history.Count);
        foreach (var turn in history)
        {
            if (turn is null || string.IsNullOrWhiteSpace(turn.Content))
                continue;

            var role = turn.Role?.Trim().ToLowerInvariant();
            if (role != UserRole && role != AssistantRole)
                continue;

            var content = turn.Content.Length > MaxTurnChars ? turn.Content[..MaxTurnChars] : turn.Content;
            cleaned.Add(new AskTurnDto(role, content));
        }

        if (cleaned.Count <= MaxTurns)
            return cleaned;

        return cleaned.GetRange(cleaned.Count - MaxTurns, MaxTurns);
    }

    /// <summary>
    /// Assembles the chat messages for the gateway: a "user" message carrying the numbered excerpts +
    /// the reader's notes (the grounding context block), then the clamped prior turns in order, then
    /// the new question as the final "user" message. The system (companion) prompt is supplied
    /// separately on the <see cref="LlmRequest"/>. <paramref name="history"/> is assumed already
    /// clamped by <see cref="Clamp"/>.
    /// </summary>
    public static IReadOnlyList<LlmMessage> BuildMessages(
        string contextBlock, IReadOnlyList<AskTurnDto> history, string question)
    {
        var messages = new List<LlmMessage>(history.Count + 2)
        {
            new(UserRole, contextBlock),
        };

        foreach (var turn in history)
            messages.Add(new LlmMessage(turn.Role, turn.Content));

        messages.Add(new LlmMessage(UserRole, question));
        return messages;
    }
}
