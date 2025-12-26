namespace Domain.Entities;

public class Author
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public required string Slug { get; set; }
    public required string Name { get; set; }
    public string? Bio { get; set; }
    public string? PhotoPath { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    // SEO fields
    public bool Indexable { get; set; } = true;
    public string? SeoTitle { get; set; }
    public string? SeoDescription { get; set; }

    public Site Site { get; set; } = null!;
    public ICollection<Edition> Editions { get; set; } = [];
}
