using Domain.Enums;

namespace Domain.Entities;

public class CodeGenJob
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public required string Description { get; set; }
    public int MaxIterations { get; set; } = 10;
    public int CompletedIterations { get; set; }

    public CodeGenJobStatus Status { get; set; } = CodeGenJobStatus.Queued;
    public string? BranchName { get; set; }
    public string? PrUrl { get; set; }
    public string? Error { get; set; }
    public string? LogOutput { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }

    public Site Site { get; set; } = null!;
}
