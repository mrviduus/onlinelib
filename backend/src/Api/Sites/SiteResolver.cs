using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Api.Sites;

public class SiteResolver : ISiteResolver
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IMemoryCache _cache;
    private readonly TimeSpan _cacheDuration = TimeSpan.FromMinutes(10);
    private const string CachePrefix = "site:";

    public SiteResolver(IServiceScopeFactory scopeFactory, IMemoryCache cache)
    {
        _scopeFactory = scopeFactory;
        _cache = cache;
    }

    public async Task<SiteContext?> ResolveAsync(string host, CancellationToken ct = default)
    {
        var cacheKey = CachePrefix + host.ToLowerInvariant();

        if (_cache.TryGetValue(cacheKey, out SiteContext? cached))
            return cached;

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Try exact domain match in site_domains table
        var site = await db.SiteDomains
            .Where(d => d.Domain == host)
            .Select(d => new SiteContext(
                d.Site.Id,
                d.Site.Code,
                d.Site.PrimaryDomain,
                d.Site.DefaultLanguage,
                d.Site.Theme,
                d.Site.AdsEnabled,
                d.Site.IndexingEnabled,
                d.Site.SitemapEnabled,
                d.Site.FeaturesJson
            ))
            .FirstOrDefaultAsync(ct);

        // Fallback: try primary_domain match
        site ??= await db.Sites
            .Where(s => s.PrimaryDomain == host)
            .Select(s => new SiteContext(
                s.Id,
                s.Code,
                s.PrimaryDomain,
                s.DefaultLanguage,
                s.Theme,
                s.AdsEnabled,
                s.IndexingEnabled,
                s.SitemapEnabled,
                s.FeaturesJson
            ))
            .FirstOrDefaultAsync(ct);

        if (site is not null)
        {
            _cache.Set(cacheKey, site, _cacheDuration);
        }

        return site;
    }

    public void InvalidateCache()
    {
        // Simple approach: clear all site cache entries
        // For production, use distributed cache with proper invalidation
        if (_cache is MemoryCache mc)
        {
            mc.Compact(1.0); // Remove all entries
        }
    }
}
