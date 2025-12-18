using Api.Sites;
using Infrastructure.Data;
using Infrastructure.Data.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class AdminSitesEndpoints
{
    public static void MapAdminSitesEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/admin/sites").WithTags("Admin Sites");

        group.MapGet("", GetSites).WithName("GetSites");
        group.MapGet("/{id:guid}", GetSite).WithName("GetSite");
        group.MapPost("", CreateSite).WithName("CreateSite");
        group.MapPut("/{id:guid}", UpdateSite).WithName("UpdateSite");
        group.MapDelete("/{id:guid}", DeleteSite).WithName("DeleteSite");

        // Domain management
        group.MapGet("/{id:guid}/domains", GetSiteDomains).WithName("GetSiteDomains");
        group.MapPost("/{id:guid}/domains", AddSiteDomain).WithName("AddSiteDomain");
        group.MapDelete("/{id:guid}/domains/{domainId:guid}", RemoveSiteDomain).WithName("RemoveSiteDomain");
    }

    public record CreateSiteRequest(
        string Code,
        string PrimaryDomain,
        string DefaultLanguage,
        string? Theme,
        bool AdsEnabled,
        bool IndexingEnabled,
        bool SitemapEnabled,
        string? FeaturesJson
    );

    public record UpdateSiteRequest(
        string? PrimaryDomain,
        string? DefaultLanguage,
        string? Theme,
        bool? AdsEnabled,
        bool? IndexingEnabled,
        bool? SitemapEnabled,
        string? FeaturesJson
    );

    public record AddDomainRequest(string Domain, bool IsPrimary);

    private static async Task<IResult> GetSites(
        AppDbContext db,
        CancellationToken ct)
    {
        var sites = await db.Sites
            .OrderBy(s => s.Code)
            .Select(s => new
            {
                s.Id,
                s.Code,
                s.PrimaryDomain,
                s.DefaultLanguage,
                s.Theme,
                s.AdsEnabled,
                s.IndexingEnabled,
                s.SitemapEnabled,
                DomainCount = s.Domains.Count,
                WorkCount = s.Works.Count
            })
            .ToListAsync(ct);

        return Results.Ok(sites);
    }

    private static async Task<IResult> GetSite(
        Guid id,
        AppDbContext db,
        CancellationToken ct)
    {
        var site = await db.Sites
            .Where(s => s.Id == id)
            .Select(s => new
            {
                s.Id,
                s.Code,
                s.PrimaryDomain,
                s.DefaultLanguage,
                s.Theme,
                s.AdsEnabled,
                s.IndexingEnabled,
                s.SitemapEnabled,
                s.FeaturesJson,
                s.CreatedAt,
                s.UpdatedAt,
                Domains = s.Domains.Select(d => new { d.Id, d.Domain, d.IsPrimary }).ToList()
            })
            .FirstOrDefaultAsync(ct);

        return site is null ? Results.NotFound() : Results.Ok(site);
    }

    private static async Task<IResult> CreateSite(
        [FromBody] CreateSiteRequest req,
        AppDbContext db,
        ISiteResolver resolver,
        CancellationToken ct)
    {
        // Check for duplicate code or domain
        if (await db.Sites.AnyAsync(s => s.Code == req.Code, ct))
            return Results.Conflict(new { error = "Site code already exists" });

        if (await db.Sites.AnyAsync(s => s.PrimaryDomain == req.PrimaryDomain, ct))
            return Results.Conflict(new { error = "Primary domain already exists" });

        var now = DateTimeOffset.UtcNow;
        var site = new Site
        {
            Id = Guid.NewGuid(),
            Code = req.Code,
            PrimaryDomain = req.PrimaryDomain,
            DefaultLanguage = req.DefaultLanguage,
            Theme = req.Theme ?? "default",
            AdsEnabled = req.AdsEnabled,
            IndexingEnabled = req.IndexingEnabled,
            SitemapEnabled = req.SitemapEnabled,
            FeaturesJson = req.FeaturesJson ?? "{}",
            CreatedAt = now,
            UpdatedAt = now
        };

        db.Sites.Add(site);

        // Also add primary domain to site_domains
        var domain = new SiteDomain
        {
            Id = Guid.NewGuid(),
            SiteId = site.Id,
            Domain = req.PrimaryDomain,
            IsPrimary = true,
            CreatedAt = now
        };
        db.SiteDomains.Add(domain);

        await db.SaveChangesAsync(ct);
        resolver.InvalidateCache();

        return Results.Created($"/admin/sites/{site.Id}", new { site.Id, site.Code });
    }

    private static async Task<IResult> UpdateSite(
        Guid id,
        [FromBody] UpdateSiteRequest req,
        AppDbContext db,
        ISiteResolver resolver,
        CancellationToken ct)
    {
        var site = await db.Sites.FindAsync([id], ct);
        if (site is null)
            return Results.NotFound();

        if (req.PrimaryDomain is not null)
        {
            if (await db.Sites.AnyAsync(s => s.Id != id && s.PrimaryDomain == req.PrimaryDomain, ct))
                return Results.Conflict(new { error = "Primary domain already exists" });
            site.PrimaryDomain = req.PrimaryDomain;
        }

        if (req.DefaultLanguage is not null)
            site.DefaultLanguage = req.DefaultLanguage;
        if (req.Theme is not null)
            site.Theme = req.Theme;
        if (req.AdsEnabled.HasValue)
            site.AdsEnabled = req.AdsEnabled.Value;
        if (req.IndexingEnabled.HasValue)
            site.IndexingEnabled = req.IndexingEnabled.Value;
        if (req.SitemapEnabled.HasValue)
            site.SitemapEnabled = req.SitemapEnabled.Value;
        if (req.FeaturesJson is not null)
            site.FeaturesJson = req.FeaturesJson;

        site.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        resolver.InvalidateCache();

        return Results.Ok(new { site.Id, site.Code });
    }

    private static async Task<IResult> DeleteSite(
        Guid id,
        AppDbContext db,
        ISiteResolver resolver,
        CancellationToken ct)
    {
        var site = await db.Sites.FindAsync([id], ct);
        if (site is null)
            return Results.NotFound();

        // Check if site has any works
        var hasWorks = await db.Works.AnyAsync(w => w.SiteId == id, ct);
        if (hasWorks)
            return Results.Conflict(new { error = "Cannot delete site with existing works" });

        db.Sites.Remove(site);
        await db.SaveChangesAsync(ct);
        resolver.InvalidateCache();

        return Results.NoContent();
    }

    private static async Task<IResult> GetSiteDomains(
        Guid id,
        AppDbContext db,
        CancellationToken ct)
    {
        var domains = await db.SiteDomains
            .Where(d => d.SiteId == id)
            .Select(d => new { d.Id, d.Domain, d.IsPrimary, d.CreatedAt })
            .ToListAsync(ct);

        return Results.Ok(domains);
    }

    private static async Task<IResult> AddSiteDomain(
        Guid id,
        [FromBody] AddDomainRequest req,
        AppDbContext db,
        ISiteResolver resolver,
        CancellationToken ct)
    {
        if (!await db.Sites.AnyAsync(s => s.Id == id, ct))
            return Results.NotFound();

        if (await db.SiteDomains.AnyAsync(d => d.Domain == req.Domain, ct))
            return Results.Conflict(new { error = "Domain already exists" });

        var domain = new SiteDomain
        {
            Id = Guid.NewGuid(),
            SiteId = id,
            Domain = req.Domain,
            IsPrimary = req.IsPrimary,
            CreatedAt = DateTimeOffset.UtcNow
        };

        db.SiteDomains.Add(domain);
        await db.SaveChangesAsync(ct);
        resolver.InvalidateCache();

        return Results.Created($"/admin/sites/{id}/domains/{domain.Id}", new { domain.Id, domain.Domain });
    }

    private static async Task<IResult> RemoveSiteDomain(
        Guid id,
        Guid domainId,
        AppDbContext db,
        ISiteResolver resolver,
        CancellationToken ct)
    {
        var domain = await db.SiteDomains
            .FirstOrDefaultAsync(d => d.Id == domainId && d.SiteId == id, ct);

        if (domain is null)
            return Results.NotFound();

        db.SiteDomains.Remove(domain);
        await db.SaveChangesAsync(ct);
        resolver.InvalidateCache();

        return Results.NoContent();
    }
}
