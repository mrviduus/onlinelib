namespace Domain.Entities;

public class BoardTask
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public required string Title { get; set; }
    public required string Status { get; set; }
    public int Order { get; set; }
    public required string Source { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public Site Site { get; set; } = null!;
}
