using Application.Common.Interfaces;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Seo;

/// <summary>
/// Reports coverage (how many indexable entities have each SEO field populated) and gaps
/// (entities missing a specific field). Used by the admin panel Coverage/Gaps tabs.
/// </summary>
public class SeoCoverageAnalyzer(IAppDbContext db)
{
    public record CoverageStat(string EntityType, string FieldType, int Total, int Populated, int Missing);

    public record GapRow(string EntityType, Guid EntityId, string Label, string Language, List<string> MissingFields);

    public async Task<List<CoverageStat>> GetCoverageAsync(CancellationToken ct)
    {
        var result = new List<CoverageStat>();

        // Author: Bio, Relevance, Themes, Faqs, SeoTitle, SeoDescription
        var authorTotal = await db.Authors.CountAsync(a => a.Indexable, ct);
        result.Add(new("Author", "Bio", authorTotal, await db.Authors.CountAsync(a => a.Indexable && !string.IsNullOrEmpty(a.Bio), ct), 0));
        result.Add(new("Author", "Relevance", authorTotal, await db.Authors.CountAsync(a => a.Indexable && !string.IsNullOrEmpty(a.SeoRelevanceText), ct), 0));
        result.Add(new("Author", "Themes", authorTotal, await db.Authors.CountAsync(a => a.Indexable && !string.IsNullOrEmpty(a.SeoThemesJson), ct), 0));
        result.Add(new("Author", "Faqs", authorTotal, await db.Authors.CountAsync(a => a.Indexable && !string.IsNullOrEmpty(a.SeoFaqsJson), ct), 0));
        result.Add(new("Author", "SeoTitle", authorTotal, await db.Authors.CountAsync(a => a.Indexable && !string.IsNullOrEmpty(a.SeoTitle), ct), 0));
        result.Add(new("Author", "SeoDescription", authorTotal, await db.Authors.CountAsync(a => a.Indexable && !string.IsNullOrEmpty(a.SeoDescription), ct), 0));

        // Edition: Description, Relevance, Themes, Faqs, SeoTitle, SeoDescription
        var editionTotal = await db.Editions.CountAsync(e => e.Indexable && e.Status == EditionStatus.Published, ct);
        result.Add(new("Edition", "Description", editionTotal, await db.Editions.CountAsync(e => e.Indexable && e.Status == EditionStatus.Published && !string.IsNullOrEmpty(e.Description), ct), 0));
        result.Add(new("Edition", "Relevance", editionTotal, await db.Editions.CountAsync(e => e.Indexable && e.Status == EditionStatus.Published && !string.IsNullOrEmpty(e.SeoRelevanceText), ct), 0));
        result.Add(new("Edition", "Themes", editionTotal, await db.Editions.CountAsync(e => e.Indexable && e.Status == EditionStatus.Published && !string.IsNullOrEmpty(e.SeoThemesJson), ct), 0));
        result.Add(new("Edition", "Faqs", editionTotal, await db.Editions.CountAsync(e => e.Indexable && e.Status == EditionStatus.Published && !string.IsNullOrEmpty(e.SeoFaqsJson), ct), 0));
        result.Add(new("Edition", "SeoTitle", editionTotal, await db.Editions.CountAsync(e => e.Indexable && e.Status == EditionStatus.Published && !string.IsNullOrEmpty(e.SeoTitle), ct), 0));
        result.Add(new("Edition", "SeoDescription", editionTotal, await db.Editions.CountAsync(e => e.Indexable && e.Status == EditionStatus.Published && !string.IsNullOrEmpty(e.SeoDescription), ct), 0));

        // Genre: Description, SeoTitle, SeoDescription
        var genreTotal = await db.Genres.CountAsync(g => g.Indexable, ct);
        result.Add(new("Genre", "Description", genreTotal, await db.Genres.CountAsync(g => g.Indexable && !string.IsNullOrEmpty(g.Description), ct), 0));
        result.Add(new("Genre", "SeoTitle", genreTotal, await db.Genres.CountAsync(g => g.Indexable && !string.IsNullOrEmpty(g.SeoTitle), ct), 0));
        result.Add(new("Genre", "SeoDescription", genreTotal, await db.Genres.CountAsync(g => g.Indexable && !string.IsNullOrEmpty(g.SeoDescription), ct), 0));

        // BlogPost: SeoTitle, SeoDescription
        var blogTotal = await db.BlogPosts.CountAsync(p => p.Status == BlogPostStatus.Published, ct);
        result.Add(new("BlogPost", "SeoTitle", blogTotal, await db.BlogPosts.CountAsync(p => p.Status == BlogPostStatus.Published && !string.IsNullOrEmpty(p.SeoTitle), ct), 0));
        result.Add(new("BlogPost", "SeoDescription", blogTotal, await db.BlogPosts.CountAsync(p => p.Status == BlogPostStatus.Published && !string.IsNullOrEmpty(p.SeoDescription), ct), 0));

        return result.Select(s => s with { Missing = s.Total - s.Populated }).ToList();
    }

    public async Task<List<GapRow>> GetAuthorGapsAsync(string? language, int limit, CancellationToken ct)
    {
        var q = db.Authors.AsNoTracking().Where(a => a.Indexable && a.SeoSource != SeoSource.Manual);
        // Language filter keyed on author's first edition
        var list = await q.OrderBy(a => a.Name).Take(limit).ToListAsync(ct);
        return list.Select(a =>
        {
            var missing = new List<string>();
            if (string.IsNullOrEmpty(a.Bio)) missing.Add("Bio");
            if (string.IsNullOrEmpty(a.SeoRelevanceText)) missing.Add("Relevance");
            if (string.IsNullOrEmpty(a.SeoThemesJson)) missing.Add("Themes");
            if (string.IsNullOrEmpty(a.SeoFaqsJson)) missing.Add("Faqs");
            if (string.IsNullOrEmpty(a.SeoTitle)) missing.Add("SeoTitle");
            if (string.IsNullOrEmpty(a.SeoDescription)) missing.Add("SeoDescription");
            return new GapRow("Author", a.Id, a.Name, language ?? "en", missing);
        }).Where(r => r.MissingFields.Count > 0).ToList();
    }

    public async Task<List<GapRow>> GetEditionGapsAsync(string? language, int limit, CancellationToken ct)
    {
        var q = db.Editions.AsNoTracking()
            .Where(e => e.Indexable && e.Status == EditionStatus.Published && e.SeoSource != SeoSource.Manual);
        if (!string.IsNullOrWhiteSpace(language)) q = q.Where(e => e.Language == language);

        var list = await q.OrderBy(e => e.Title).Take(limit).ToListAsync(ct);
        return list.Select(e =>
        {
            var missing = new List<string>();
            if (string.IsNullOrEmpty(e.Description)) missing.Add("Description");
            if (string.IsNullOrEmpty(e.SeoRelevanceText)) missing.Add("Relevance");
            if (string.IsNullOrEmpty(e.SeoThemesJson)) missing.Add("Themes");
            if (string.IsNullOrEmpty(e.SeoFaqsJson)) missing.Add("Faqs");
            if (string.IsNullOrEmpty(e.SeoTitle)) missing.Add("SeoTitle");
            if (string.IsNullOrEmpty(e.SeoDescription)) missing.Add("SeoDescription");
            return new GapRow("Edition", e.Id, e.Title, e.Language, missing);
        }).Where(r => r.MissingFields.Count > 0).ToList();
    }

    public async Task<List<GapRow>> GetGenreGapsAsync(int limit, CancellationToken ct)
    {
        var q = db.Genres.AsNoTracking().Where(g => g.Indexable && g.SeoSource != SeoSource.Manual);
        var list = await q.OrderBy(g => g.Name).Take(limit).ToListAsync(ct);
        return list.Select(g =>
        {
            var missing = new List<string>();
            if (string.IsNullOrEmpty(g.Description)) missing.Add("Description");
            if (string.IsNullOrEmpty(g.SeoTitle)) missing.Add("SeoTitle");
            if (string.IsNullOrEmpty(g.SeoDescription)) missing.Add("SeoDescription");
            return new GapRow("Genre", g.Id, g.Name, "en", missing);
        }).Where(r => r.MissingFields.Count > 0).ToList();
    }

    public async Task<List<GapRow>> GetBlogPostGapsAsync(string? language, int limit, CancellationToken ct)
    {
        var q = db.BlogPosts.AsNoTracking()
            .Where(p => p.Status == BlogPostStatus.Published && p.SeoSource != SeoSource.Manual);
        if (!string.IsNullOrWhiteSpace(language)) q = q.Where(p => p.Language == language);

        var list = await q.OrderBy(p => p.Title).Take(limit).ToListAsync(ct);
        return list.Select(p =>
        {
            var missing = new List<string>();
            if (string.IsNullOrEmpty(p.SeoTitle)) missing.Add("SeoTitle");
            if (string.IsNullOrEmpty(p.SeoDescription)) missing.Add("SeoDescription");
            return new GapRow("BlogPost", p.Id, p.Title, p.Language, missing);
        }).Where(r => r.MissingFields.Count > 0).ToList();
    }
}
