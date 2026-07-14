using Application.Ai;
using Contracts.Books;

namespace Application.BookChat;

/// <summary>
/// Pure history/memory assembly for persistent Book Chat. The server owns the conversation, so this turns
/// the stored rolling <c>summary</c> plus the recent persisted turns into the <see cref="AskTurnDto"/>
/// history the existing <see cref="RagAskHistory"/> / <c>RagAskService</c> seam consumes. Also the small
/// ord / summary-watermark math. All static + pure so it's unit-tested without a DB or LLM.
/// </summary>
public static class BookChatHistory
{
    /// <summary>
    /// Gap (in message ords) between the newest turn and the summary watermark that triggers a re-summarize.
    /// Once <c>maxOrd - summarizedThroughOrd &gt;= </c> this, the turns aging out of the live window are folded
    /// into the rolling summary.
    /// </summary>
    public const int SummaryTriggerGap = 8;

    /// <summary>Hard cap on the stored rolling summary (chars) so it can't itself blow the prompt budget.</summary>
    public const int MaxSummaryChars = 2000;

    private const string SummaryPrimingPrompt =
        "Here is a summary of our earlier conversation about this book, for context.";

    /// <summary>The next monotonic ord for a conversation whose current highest ord is <paramref name="currentMaxOrd"/> (null = empty).</summary>
    public static int NextOrd(int? currentMaxOrd) => (currentMaxOrd ?? 0) + 1;

    /// <summary>The spoiler-gate default for a new conversation: on for catalog editions, off for user books.</summary>
    public static bool DefaultSpoilerGate(bool isEdition) => isEdition;

    /// <summary>True iff exactly one of the two book targets is set (the DB CHECK, mirrored in code).</summary>
    public static bool IsValidTarget(Guid? editionId, Guid? userBookId)
        => editionId.HasValue ^ userBookId.HasValue;

    /// <summary>
    /// True once the conversation has accrued <see cref="SummaryTriggerGap"/> ords beyond the summary
    /// watermark — the signal to fold the aged-out turns into the rolling summary.
    /// </summary>
    public static bool ShouldSummarize(int maxOrd, int summarizedThroughOrd)
        => maxOrd - summarizedThroughOrd >= SummaryTriggerGap;

    /// <summary>
    /// The new summary watermark after a summarize: everything up to (but not including) the live window of
    /// the last <see cref="RagAskHistory.MaxTurns"/> messages is considered folded in.
    /// </summary>
    public static int NextWatermark(int maxOrd) => Math.Max(0, maxOrd - RagAskHistory.MaxTurns);

    /// <summary>
    /// Assembles the multi-turn history for the ask seam: the rolling <paramref name="summary"/> as a
    /// priming exchange (a user note + the summary as an assistant turn) when non-empty, followed by the
    /// <paramref name="recentTurns"/> clamped via <see cref="RagAskHistory.Clamp"/> (last few, content-capped).
    /// The new question is appended separately by <see cref="RagAskHistory.BuildMessages"/>. Pure.
    /// </summary>
    public static IReadOnlyList<AskTurnDto> BuildHistory(
        string? summary, IReadOnlyList<AskTurnDto> recentTurns)
    {
        var clamped = RagAskHistory.Clamp(recentTurns);
        if (string.IsNullOrWhiteSpace(summary))
            return clamped;

        var result = new List<AskTurnDto>(clamped.Count + 2)
        {
            new(ConversationRole.User, SummaryPrimingPrompt),
            new(ConversationRole.Assistant, summary),
        };
        result.AddRange(clamped);
        return result;
    }

    /// <summary>Truncates a freshly-generated summary to <see cref="MaxSummaryChars"/>.</summary>
    public static string CapSummary(string summary)
        => summary.Length <= MaxSummaryChars ? summary : summary[..MaxSummaryChars];
}

/// <summary>Canonical role strings shared by the chat persistence + history assembly.</summary>
public static class ConversationRole
{
    public const string User = "user";
    public const string Assistant = "assistant";
}
