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

    /// <summary>
    /// Whether flipping the spoiler gate should drop the distilled memory (rolling summary + watermark).
    /// True ONLY on a false→true transition: while the gate was off the user may have asked ahead, and
    /// those ahead-of-progress turns get folded into <c>Summary</c>; re-enabling the gate would otherwise
    /// leak that summarized spoiler back into gated history. The raw messages stay — only the distilled
    /// memory is dropped, and the summarizer rebuilds it from the (now-gated) turns later. Toggling OFF
    /// (true→false) or a no-op needs nothing. Pure.
    /// </summary>
    public static bool ShouldClearSummaryOnGateChange(bool wasEnabled, bool nowEnabled)
        => !wasEnabled && nowEnabled;

    /// <summary>
    /// Decides what to do with a streamed assistant turn once the tee stops, from the count of streamed
    /// answer characters and whether the upstream stream faulted (LLM error item or the enumerator threw).
    /// <list type="bullet">
    /// <item><b>DeleteUserTurn</b> — nothing streamed: a bare user row with no answer pollutes the next
    /// ask's history and renders blank, so the just-persisted user turn is removed. Applies whether or not
    /// it faulted (a clean zero-delta completion is treated the same).</item>
    /// <item><b>PersistTruncated</b> — some text then a fault: persist the fragment with an interrupted
    /// marker so a reload doesn't present a truncated answer as complete.</item>
    /// <item><b>Persist</b> — some text, clean completion: persist verbatim.</item>
    /// </list>
    /// Pure.
    /// </summary>
    public static ChatPersistAction ResolvePersistAction(int streamedChars, bool faulted)
        => streamedChars <= 0
            ? ChatPersistAction.DeleteUserTurn
            : faulted ? ChatPersistAction.PersistTruncated : ChatPersistAction.Persist;

    /// <summary>Marker appended to a persisted answer that was cut off mid-stream by a fault.</summary>
    public const string TruncationMarker = "\n\n[answer interrupted]";
}

/// <summary>What the streaming tee does with the assistant turn when the stream stops (see
/// <see cref="BookChatHistory.ResolvePersistAction"/>).</summary>
public enum ChatPersistAction
{
    /// <summary>Persist the streamed answer as-is (clean completion).</summary>
    Persist,

    /// <summary>Persist the partial answer with a truncation marker (faulted mid-stream).</summary>
    PersistTruncated,

    /// <summary>Delete the orphaned user turn (nothing streamed).</summary>
    DeleteUserTurn,
}

/// <summary>Canonical role strings shared by the chat persistence + history assembly.</summary>
public static class ConversationRole
{
    public const string User = "user";
    public const string Assistant = "assistant";
}
