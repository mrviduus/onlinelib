namespace Domain.Entities;

public class HighlightLike
{
    public Guid Id { get; set; }
    public Guid HighlightId { get; set; }
    public Guid UserId { get; set; }
    public Guid SiteId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public Highlight Highlight { get; set; } = null!;
    public User User { get; set; } = null!;
    public Site Site { get; set; } = null!;
}
