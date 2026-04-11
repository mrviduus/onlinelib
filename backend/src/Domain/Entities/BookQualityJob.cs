using Domain.Enums;

namespace Domain.Entities;

public class BookQualityJob
{
    public Guid Id { get; set; }

    // Polymorphic: one of these will be set
    public Guid? EditionId { get; set; }
    public Guid? UserBookId { get; set; }

    public BookQualityJobStatus Status { get; set; } = BookQualityJobStatus.Queued;

    public string? IssuesJson { get; set; }
    public int? IssuesFound { get; set; }
    public int? IssuesFixed { get; set; }

    public string? Error { get; set; }
    public string? LogOutput { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }

    public Edition? Edition { get; set; }
    public UserBook? UserBook { get; set; }
}
