using Contracts.Books;
using TextStack.Ai.Core;

namespace Application.BookChat;

/// <summary>
/// Compresses the turns aging out of a Book Chat's live window into a short rolling summary (chat memory).
/// Runs on the cheapest existing route (FeatureTag <c>explain</c> → the nano provider) so it's near-free.
/// Called fire-and-forget from the message endpoint after an assistant turn once
/// <see cref="BookChatHistory.ShouldSummarize"/> fires; any failure is swallowed by the caller (the chat
/// never blocks on memory upkeep). The output is capped by the caller via
/// <see cref="BookChatHistory.CapSummary"/>.
/// </summary>
public sealed class ConversationSummarizer(ILlmService llm)
{
    // Reuse the nano route the cheap text tasks (explain) already use — no new config.
    public const string FeatureTag = "explain";

    private const int MaxOutputTokens = 300;

    private const string SystemPrompt =
        "You maintain a running summary of a reader's conversation with an AI about a book. " +
        "Merge the existing summary (if any) with the new exchange into a single concise summary " +
        "of at most 150 words. Preserve concrete facts, the reader's interests, and open threads. " +
        "Write plain prose, no preamble.";

    /// <summary>
    /// Produces the merged summary from the prior <paramref name="existingSummary"/> and the
    /// <paramref name="agedOutTurns"/> now leaving the live window. Returns the raw model text (uncapped —
    /// the caller caps + persists). Throws on an LLM failure so the caller can log-and-skip.
    /// </summary>
    public async Task<string> SummarizeAsync(
        string? existingSummary, IReadOnlyList<AskTurnDto> agedOutTurns, CancellationToken ct)
    {
        var userPrompt = BuildUserPrompt(existingSummary, agedOutTurns);
        var request = new LlmRequest(
            SystemPrompt: SystemPrompt,
            Messages: [new LlmMessage("user", userPrompt)],
            MaxOutputTokens: MaxOutputTokens,
            FeatureTag: FeatureTag);

        var response = await llm.CompleteAsync(request, ct);
        return response.Text?.Trim() ?? string.Empty;
    }

    private static string BuildUserPrompt(string? existingSummary, IReadOnlyList<AskTurnDto> turns)
    {
        var sb = new System.Text.StringBuilder();
        if (!string.IsNullOrWhiteSpace(existingSummary))
            sb.Append("Existing summary:\n").Append(existingSummary).Append("\n\n");
        sb.Append("New exchange:\n");
        foreach (var t in turns)
            sb.Append(t.Role).Append(": ").Append(t.Content).Append('\n');
        return sb.ToString();
    }
}
