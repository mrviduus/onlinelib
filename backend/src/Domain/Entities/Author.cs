using Domain.Enums;

namespace Domain.Entities;

public class Author : ISiteScoped
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
    public string? CanonicalOverride { get; set; }

    // SEO content blocks
    public string? SeoRelevanceText { get; set; }
    public string? SeoThemesJson { get; set; }
    public string? SeoFaqsJson { get; set; }

    /// <summary>
    /// External authority links for schema.org sameAs. Stored as JSON (jsonb).
    /// Shape: {"wikipedia":"https://…","goodreads":"…","gutenberg":"…","website":"…","twitter":"…"}.
    /// Keys with null/empty values are filtered out at render time.
    /// </summary>
    public string? ExternalLinksJson { get; set; }

    /// <summary>Provenance of the SEO fields on this entity. Drives auto-skip logic during bulk backfill.</summary>
    public SeoSource SeoSource { get; set; } = SeoSource.Manual;

    public Site Site { get; set; } = null!;
    public ICollection<EditionAuthor> EditionAuthors { get; set; } = [];
}
