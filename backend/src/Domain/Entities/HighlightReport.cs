namespace Domain.Entities;

public class HighlightReport
{
    public Guid Id { get; set; }
    public Guid HighlightId { get; set; }
    public Guid ReportedByUserId { get; set; }
    public Guid SiteId { get; set; }
    public required string Reason { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ResolvedAt { get; set; }
    public Guid? ResolvedByAdminId { get; set; }
    public string? Resolution { get; set; }

    public Highlight Highlight { get; set; } = null!;
    public User ReportedByUser { get; set; } = null!;
    public Site Site { get; set; } = null!;
}
