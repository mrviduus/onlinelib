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
    /// Returns the top <paramref name="k"/> chunks in <paramref name="editionId"/> for
    /// <paramref name="query"/>, ranked by fused (semantic + lexical) relevance. Returns empty for a
    /// blank query. The lexical branch can surface chunks that aren't embedded yet.
    /// </summary>
    /// <param name="maxChapterOrd">
    /// Spoiler gate (AI-024): if set, only chunks with <c>chapter_ord ≤ maxChapterOrd</c> are
    /// returned (chapters the user has read). Null disables the gate.
    /// </param>
    Task<IReadOnlyList<RetrievedChunk>> RetrieveAsync(
        Guid editionId, string query, int k, int? maxChapterOrd, CancellationToken ct);

    /// <summary>
    /// Phase 2: hybrid retrieval over a USER-uploaded book's chunks (isolated <c>user_chapter_chunk</c>
    /// table). Filters on BOTH <paramref name="userId"/> AND <paramref name="userBookId"/> in SQL — a
    /// user must never retrieve another user's chunks (per-user isolation, defense in depth). The
    /// returned <c>ChapterId</c> is the user chapter id (for reader deep-links). Same RRF fusion as
    /// <see cref="RetrieveAsync"/>; user books have no spoiler gate so callers pass
    /// <paramref name="maxChapterOrd"/> = null for full-book retrieval.
    /// </summary>
    Task<IReadOnlyList<RetrievedChunk>> RetrieveUserBookAsync(
        Guid userId, Guid userBookId, string query, int k, int? maxChapterOrd, CancellationToken ct);
}
