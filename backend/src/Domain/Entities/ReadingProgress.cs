namespace Domain.Entities;

public class ReadingProgress : ISiteScoped
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid SiteId { get; set; }
    public Guid EditionId { get; set; }
    public Guid ChapterId { get; set; }
    public required string Locator { get; set; }
    public double? Percent { get; set; }

    /// <summary>
    /// High-water mark: the furthest chapter ordinal (<see cref="Chapter.ChapterNumber"/>) the user
    /// has ever reached in this edition. Used by the RAG spoiler gate so flipping back to an earlier
    /// chapter doesn't hide already-read later chapters. Null on legacy rows → callers fall back to
    /// the current chapter (self-heals on the next progress save).
    /// </summary>
    public int? MaxChapterNumber { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public User User { get; set; } = null!;
    public Site Site { get; set; } = null!;
    public Edition Edition { get; set; } = null!;
    public Chapter Chapter { get; set; } = null!;
}
