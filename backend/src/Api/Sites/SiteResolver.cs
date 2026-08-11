using Application.Common.Interfaces;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Api.Sites;

public class SiteResolver : ISiteResolver
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IMemoryCache _cache;
    private readonly ICurrentSite _currentSite;
    private readonly ILogger<SiteResolver> _logger;
    private readonly TimeSpan _cacheDuration = TimeSpan.FromMinutes(10);
    private const string CachePrefix = "site:";

    public SiteResolver(
        IServiceScopeFactory scopeFactory,
        IMemoryCache cache,
        ICurrentSite currentSite,
        ILogger<SiteResolver> logger)
    {
        _scopeFactory = scopeFactory;
        _cache = cache;
        _currentSite = currentSite;
        _logger = logger;
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

        // Last resort (ADR-007, single site permanent): an unmatched host resolves to THE site.
        //
        // This exists because it silently decapitated SSG for five weeks. The ssg-worker calls
        // `http://api:8080/ssg/routes` and carefully sets a `Host` header so this resolver can find
        // the site — but `Host` is a forbidden header name in the fetch spec, so undici drops it and
        // the request arrives as `Host: api`. `api` is not in site_domains, resolution returned
        // null, the middleware answered 404 "Site not found", and every rebuild job failed with a
        // log line nobody was watching. The sitemap kept advertising books from the database while
        // ~389 of them had no generated page and returned a hard 404 to crawlers.
        //
        // Falling back is safe in exactly the way R1b's removed `?site=` override was not: that
        // override could name a DIFFERENT site, producing a SiteContext whose Id diverged from the
        // process-wide ICurrentSite.Id that EF's global query filters key on — silently yielding
        // zero rows. This resolves to ICurrentSite.Id itself, so divergence is impossible.
        // Which hosts can even get here is already constrained by AllowedHosts.
        if (site is null)
        {
            site = await db.Sites
                .Where(s => s.Id == _currentSite.Id)
                .Select(s => new SiteContext(
                    s.Id, s.Code, s.PrimaryDomain, s.DefaultLanguage, s.Theme,
                    s.AdsEnabled, s.IndexingEnabled, s.SitemapEnabled, s.FeaturesJson))
                .FirstOrDefaultAsync(ct);

            if (site is not null)
                _logger.LogWarning(
                    "Host '{Host}' is not a registered site domain; resolved to the default site. "
                    + "Expected for internal callers (ssg-worker), unexpected for public traffic.",
                    host);
        }

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
