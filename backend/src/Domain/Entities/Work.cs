namespace Domain.Entities;

public class Work
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public required string Slug { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public Site Site { get; set; } = null!;
    public ICollection<Edition> Editions { get; set; } = [];
}
