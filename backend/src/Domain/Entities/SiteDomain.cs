namespace Domain.Entities;

public class SiteDomain
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public required string Domain { get; set; }
    public bool IsPrimary { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public Site Site { get; set; } = null!;
}
