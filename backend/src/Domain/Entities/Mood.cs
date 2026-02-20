namespace Domain.Entities;

public class Mood
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public required string Slug { get; set; }
    public required string Name { get; set; }
    public string? Emoji { get; set; }
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public Site Site { get; set; } = null!;
}
