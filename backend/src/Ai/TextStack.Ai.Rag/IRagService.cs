namespace TextStack.Ai.Rag;

/// <summary>
/// Hybrid retrieval over a single edition's chunks (Phase 4 RAG, "Ask this book"). Runs semantic
/// (cosine NN) and lexical (FTS) retrieval and fuses them with Reciprocal Rank Fusion (AI-023);
/// the spoiler gate (AI-024) filters both branches in SQL.
/// </summary>
public interface IRagService
{
    /// <summary>Default number of chunks to retrieve (matches the recall@8 eval target).</summary>
    const int DefaultK = 8;

    /// <summary>
    /// Larger retrieval width for "overview-class" questions (summarize / main idea / what is chapter N
    /// about — see <c>RagAskPrompt.IsOverviewQuestion</c>). Pointwise <see cref="DefaultK"/> under-covers a
    /// whole-section ask (its lone citation lands on a TOC page); widening recall gives the model enough of
    /// the section to synthesize a grounded summary. Cheap stop-gap ahead of per-chapter precomputed summaries.
    /// </summary>
    const int OverviewK = 20;

    /// <summary>
    /// Returns the top <paramref name="k"/> chunks in <paramref name="editionId"/> for
    /// <paramref name="query"/>, ranked by fused (semantic + lexical) relevance. Returns empty for a
    /// blank query. The lexical branch can surface chunks that aren't embedded yet.
    /// </summary>
    /// <param name="maxChapterOrd">
    /// Spoiler gate (AI-024): if set, only chunks with <c>chapter_ord ≤ maxChapterOrd</c> are
    /// returned (chapters the user has read). Null disables the gate.
    /// </param>
    /// <param name="summaries">
    /// Overview-class questions ("summarize chapter N", "main idea") pass
    /// <see cref="SummarySpec.All"/> / <see cref="SummarySpec.Target"/> so the book's precomputed
    /// <c>is_summary</c> chunks (RAG "S2") are GUARANTEED into the result (still gated by
    /// <paramref name="maxChapterOrd"/>) — capped at <c>k/2</c>, and narrowed to a single chapter when the
    /// question named one. <see cref="SummarySpec.None"/> (default) leaves pinpoint retrieval unchanged
    /// (summaries remain retrievable organically).
    /// </param>
    Task<IReadOnlyList<RetrievedChunk>> RetrieveAsync(
        Guid editionId, string query, int k, int? maxChapterOrd, SummarySpec summaries, CancellationToken ct);

    /// <summary>
    /// Phase 2: hybrid retrieval over a USER-uploaded book's chunks (isolated <c>user_chapter_chunk</c>
    /// table). Filters on BOTH <paramref name="userId"/> AND <paramref name="userBookId"/> in SQL — a
    /// user must never retrieve another user's chunks (per-user isolation, defense in depth). The
    /// returned <c>ChapterId</c> is the user chapter id (for reader deep-links). Same RRF fusion as
    /// <see cref="RetrieveAsync"/>; user books have no spoiler gate so callers pass
    /// <paramref name="maxChapterOrd"/> = null for full-book retrieval.
    /// </summary>
    Task<IReadOnlyList<RetrievedChunk>> RetrieveUserBookAsync(
        Guid userId, Guid userBookId, string query, int k, int? maxChapterOrd, SummarySpec summaries,
        CancellationToken ct);
}
