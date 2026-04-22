using Domain.Enums;

namespace Domain.Entities;

public class UserBook
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public required string Title { get; set; }
    public required string Slug { get; set; }
    public required string Language { get; set; }
    public string? Author { get; set; }
    public string? Description { get; set; }
    public string? CoverPath { get; set; }
    public string? Genre { get; set; }
    public int? PublishedYear { get; set; }
    public int? TotalWordCount { get; set; }
    public string? TocJson { get; set; }
    public UserBookStatus Status { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    // Reading progress
    public string? ProgressChapterSlug { get; set; }
    public string? ProgressLocator { get; set; }
    public double? ProgressPercent { get; set; }
    public DateTimeOffset? ProgressUpdatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }

    // Takedown (DMCA / admin action) — soft-blocks access while keeping record for audit
    public DateTimeOffset? TakedownAt { get; set; }
    public string? TakedownReason { get; set; }

    public User User { get; set; } = null!;
    public ICollection<UserChapter> Chapters { get; set; } = [];
    public ICollection<UserBookFile> BookFiles { get; set; } = [];
    public ICollection<UserIngestionJob> IngestionJobs { get; set; } = [];
}
