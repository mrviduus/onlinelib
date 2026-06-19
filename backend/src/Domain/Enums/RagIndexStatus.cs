namespace Domain.Enums;

/// <summary>
/// Per-edition on-demand RAG index state (Phase 1 "Ask this book"). Catalog editions imported
/// before RAG start <see cref="NotIndexed"/>; a user trigger claims the edition (<see cref="Indexing"/>),
/// chunks are created, then the embedding worker flips it to <see cref="Ready"/> once every chunk is
/// embedded. <see cref="Failed"/> is re-claimable (clears stale partial chunks).
/// </summary>
public enum RagIndexStatus
{
    NotIndexed = 0,
    Indexing = 1,
    Ready = 2,
    Failed = 3
}
