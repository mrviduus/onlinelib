using NpgsqlTypes;

namespace Domain.Entities;

public class Chapter
{
    public Guid Id { get; set; }
    public Guid EditionId { get; set; }
    public int ChapterNumber { get; set; }
    public string? Slug { get; set; }
    public required string Title { get; set; }
    public required string Html { get; set; }
    public required string PlainText { get; set; }
    public int? WordCount { get; set; }
    public NpgsqlTsVector SearchVector { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public Edition Edition { get; set; } = null!;
    public ICollection<ReadingProgress> ReadingProgresses { get; set; } = [];
    public ICollection<Bookmark> Bookmarks { get; set; } = [];
    public ICollection<Note> Notes { get; set; } = [];
}
