using Application.Common.Interfaces;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Seo;

public record SitemapBookDto(string Slug, DateTimeOffset UpdatedAt);
public record SitemapChapterDto(string BookSlug, string Slug, DateTimeOffset UpdatedAt);

public class SeoService(IAppDbContext db)
{
    public async Task<int> GetChapterCountAsync(Guid siteId, CancellationToken ct)
    {
        return await db.Chapters
            .Where(c => c.Edition.SiteId == siteId && c.Edition.Status == EditionStatus.Published)
            .CountAsync(ct);
    }

    public async Task<List<SitemapBookDto>> GetBooksForSitemapAsync(Guid siteId, CancellationToken ct)
    {
        return await db.Editions
            .Where(e => e.SiteId == siteId && e.Status == EditionStatus.Published)
            .OrderByDescending(e => e.UpdatedAt)
            .Select(e => new SitemapBookDto(e.Slug, e.UpdatedAt))
            .ToListAsync(ct);
    }

    public async Task<List<SitemapChapterDto>> GetChaptersForSitemapAsync(
        Guid siteId, int page, int pageSize, CancellationToken ct)
    {
        return await db.Chapters
            .Where(c => c.Edition.SiteId == siteId && c.Edition.Status == EditionStatus.Published)
            .OrderBy(c => c.Edition.Slug)
            .ThenBy(c => c.ChapterNumber)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(c => new SitemapChapterDto(c.Edition.Slug, c.Slug ?? "", c.Edition.UpdatedAt))
            .ToListAsync(ct);
    }
}
