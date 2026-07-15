namespace TextStack.Ai.Rag;

/// <summary>
/// Selects whether — and how — the book's precomputed per-chapter summary chunks (RAG "S2",
/// <c>is_summary</c>) are GUARANTEED into a retrieval result. One value carries the whole decision so
/// the retrieval seam stays a single parameter with no invalid combinations.
/// <list type="bullet">
///   <item><see cref="None"/> — pinpoint retrieval (default). No summary fetch; byte-identical to the
///   pre-summary behaviour (summaries can still surface organically through hybrid search).</item>
///   <item><see cref="All"/> — an overview question with NO named chapter → prepend up to <c>k/2</c>
///   summaries (chapter_ord ascending), leaving at least half of <c>k</c> for organic body excerpts so a
///   ≥20-chapter book can't return only summaries.</item>
///   <item><see cref="Target"/> — the question named a chapter → guarantee ONLY that chapter's summary
///   (lenient ord match, see <c>RagService.SelectSummaryIds</c>) plus organic chunks.</item>
/// </list>
/// </summary>
public readonly record struct SummarySpec(bool Include, int? TargetChapterOrd)
{
    /// <summary>Pinpoint retrieval — no guaranteed summaries.</summary>
    public static SummarySpec None => new(false, null);

    /// <summary>Overview with no named chapter — all summaries eligible, capped at k/2 by the merge.</summary>
    public static SummarySpec All => new(true, null);

    /// <summary>
    /// Overview naming a chapter — guarantee only that chapter's summary. A null ord (overview but no
    /// parseable chapter number) degrades to <see cref="All"/>.
    /// </summary>
    public static SummarySpec Target(int? targetChapterOrd) =>
        targetChapterOrd is { } ord ? new SummarySpec(true, ord) : All;
}
