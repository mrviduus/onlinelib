namespace Domain.Entities;

/// <summary>
/// A retrieval unit for Phase 2 on-demand RAG over a USER-uploaded book ("Ask this book" for
/// <see cref="UserBook"/>). Mirrors <see cref="ChapterChunk"/> but lives in its OWN table
/// (<c>user_chapter_chunk</c>) — never polymorphic with the catalog chunks — and carries a
/// denormalized <see cref="UserId"/> so retrieval can hard-filter <c>WHERE user_id = @userId</c> as
/// defense-in-depth on top of <see cref="UserBookId"/>. A user must never retrieve another user's
/// chunks. Produced by <c>BookChunkingService.ChunkUserBookAsync</c>, embedded by the shared
/// embedding worker, queried by spoiler-free per-user retrieval. EF mapping in AppDbContext.Rag.cs.
/// </summary>
public class UserChapterChunk
{
    public Guid Id { get; set; }

    /// <summary>Owning user book.</summary>
    public Guid UserBookId { get; set; }

    /// <summary>Source chapter within the user book.</summary>
    public Guid UserChapterId { get; set; }

    /// <summary>
    /// Denormalized owner id (copied from the book's <see cref="UserBook.UserId"/>). Lets retrieval
    /// filter <c>WHERE user_id = @userId AND user_book_id = @userBookId</c> in SQL — a per-user
    /// isolation boundary that holds even if a caller passes a foreign book id.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>Chunk order within its chapter (0-based).</summary>
    public int Ord { get; set; }

    /// <summary>
    /// Denormalized chapter order, copied from the chapter number. User books have no spoiler gate
    /// (it's the user's own document), but keeping the column mirrors <see cref="ChapterChunk"/> and
    /// supports an optional ceiling.
    /// </summary>
    public int ChapterOrd { get; set; }

    /// <summary>The chunk's plain text (the unit that gets embedded).</summary>
    public string Text { get; set; } = string.Empty;

    /// <summary>
    /// 1536-d embedding (OpenAI text-embedding-3-small). <c>float[]</c> to keep Domain framework-free;
    /// mapped to pgvector <c>vector(1536)</c>. Nullable: the chunker inserts text, the worker fills this.
    /// </summary>
    public float[]? Embedding { get; set; }

    public int TokenCount { get; set; }

    /// <summary>Start offset of this chunk in the chapter's plain_text (inclusive).</summary>
    public int CharStart { get; set; }

    /// <summary>End offset of this chunk in the chapter's plain_text (exclusive).</summary>
    public int CharEnd { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public UserBook? UserBook { get; set; }
    public UserChapter? UserChapter { get; set; }
}
