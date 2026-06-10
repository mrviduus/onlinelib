namespace Domain.Entities;

/// <summary>
/// A retrieval unit for Phase 4 RAG ("Ask this book"): a sentence-aware slice of a
/// chapter's plain text plus its embedding vector. Produced by the chunker (AI-019),
/// embedded by the embedding client (AI-020/021), and queried by spoiler-safe
/// retrieval via raw Npgsql (AI-022+). EF mapping in AppDbContext.Rag.cs (table
/// <c>chapter_chunk</c>, snake_case columns).
/// </summary>
public class ChapterChunk
{
    public Guid Id { get; set; }
    public Guid EditionId { get; set; }
    public Guid ChapterId { get; set; }

    /// <summary>Chunk order within its chapter (0-based).</summary>
    public int Ord { get; set; }

    /// <summary>
    /// Denormalized chapter order, copied from the chapter. Lets the spoiler gate
    /// filter <c>WHERE chapter_ord &lt;= @lastRead</c> in SQL without joining chapters.
    /// </summary>
    public int ChapterOrd { get; set; }

    /// <summary>The chunk's plain text (the unit that gets embedded).</summary>
    public string Text { get; set; } = string.Empty;

    /// <summary>
    /// 1536-d embedding (OpenAI text-embedding-3-small). Modeled as <c>float[]</c> to
    /// keep Domain framework-free; mapped to pgvector <c>vector(1536)</c> in EF.
    /// Nullable: the chunker inserts text first, the batch embedder fills this later.
    /// </summary>
    public float[]? Embedding { get; set; }

    public int TokenCount { get; set; }

    /// <summary>Start offset of this chunk in the chapter's plain_text (inclusive).</summary>
    public int CharStart { get; set; }

    /// <summary>End offset of this chunk in the chapter's plain_text (exclusive).</summary>
    public int CharEnd { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public Edition? Edition { get; set; }
    public Chapter? Chapter { get; set; }
}
