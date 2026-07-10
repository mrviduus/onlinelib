namespace Domain.Entities;

public class UserBookBookmark
{
    public Guid Id { get; set; }
    public Guid UserBookId { get; set; }
    // Nullable: PDFs opened in "Original layout" (ADR-012) are chapterless — a page
    // bookmark has no chapter and anchors on Locator ("page:N"). Reflow/EPUB bookmarks
    // still carry a chapter (backward compatible).
    public Guid? ChapterId { get; set; }
    public required string Locator { get; set; }
    public string? Title { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public UserBook UserBook { get; set; } = null!;
    public UserChapter? Chapter { get; set; }
}
