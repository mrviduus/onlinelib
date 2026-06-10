namespace TextStack.Ai.Rag;

/// <summary>
/// Vector retrieval over a single edition's chunks (Phase 4 RAG, "Ask this book"). Embeds the
/// query and returns the nearest <c>chapter_chunk</c> rows by cosine similarity. Vector-only in
/// v1 — hybrid/RRF (AI-023) and the spoiler gate (AI-024) layer on top.
/// </summary>
public interface IRagService
{
    /// <summary>Default number of chunks to retrieve (matches the recall@8 eval target).</summary>
    const int DefaultK = 8;

    /// <summary>
    /// Returns the <paramref name="k"/> chunks in <paramref name="editionId"/> most similar to
    /// <paramref name="query"/>, ranked by descending cosine similarity. Skips chunks without an
    /// embedding. Returns empty for a blank query.
    /// </summary>
    Task<IReadOnlyList<RetrievedChunk>> RetrieveAsync(
        Guid editionId, string query, int k, CancellationToken ct);
}
