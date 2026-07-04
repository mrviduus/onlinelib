using Domain.Enums;

namespace Domain.Entities;

public class Genre : ISiteScoped
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public required string Slug { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    // SEO fields
    public bool Indexable { get; set; } = true;
    public string? SeoTitle { get; set; }
    public string? SeoDescription { get; set; }

    /// <summary>Provenance of the SEO fields on this entity. Drives auto-skip logic during bulk backfill.</summary>
    public SeoSource SeoSource { get; set; } = SeoSource.Manual;

    public Site Site { get; set; } = null!;
    public ICollection<Edition> Editions { get; set; } = [];
}
