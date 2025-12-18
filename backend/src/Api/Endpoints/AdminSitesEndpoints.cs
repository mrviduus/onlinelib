using Api.Sites;
using Application.Sites;
using Microsoft.AspNetCore.Mvc;

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

        group.MapGet("/{id:guid}/domains", GetSiteDomains).WithName("GetSiteDomains");
        group.MapPost("/{id:guid}/domains", AddSiteDomain).WithName("AddSiteDomain");
        group.MapDelete("/{id:guid}/domains/{domainId:guid}", RemoveSiteDomain).WithName("RemoveSiteDomain");
    }

    private static async Task<IResult> GetSites(
        SiteService siteService,
        CancellationToken ct)
    {
        var sites = await siteService.GetSitesAsync(ct);
        return Results.Ok(sites);
    }

    private static async Task<IResult> GetSite(
        Guid id,
        SiteService siteService,
        CancellationToken ct)
    {
        var site = await siteService.GetSiteAsync(id, ct);
        return site is null ? Results.NotFound() : Results.Ok(site);
    }

    private static async Task<IResult> CreateSite(
        [FromBody] CreateSiteRequest req,
        SiteService siteService,
        ISiteResolver resolver,
        CancellationToken ct)
    {
        var (valid, error) = await siteService.ValidateCreateAsync(req, ct);
        if (!valid)
            return Results.Conflict(new { error });

        var site = await siteService.CreateSiteAsync(req, ct);
        resolver.InvalidateCache();

        return Results.Created($"/admin/sites/{site.Id}", new { site.Id, site.Code });
    }

    private static async Task<IResult> UpdateSite(
        Guid id,
        [FromBody] UpdateSiteRequest req,
        SiteService siteService,
        ISiteResolver resolver,
        CancellationToken ct)
    {
        var (found, error) = await siteService.UpdateSiteAsync(id, req, ct);
        if (!found)
            return Results.NotFound();
        if (error is not null)
            return Results.Conflict(new { error });

        resolver.InvalidateCache();
        return Results.Ok(new { id });
    }

    private static async Task<IResult> DeleteSite(
        Guid id,
        SiteService siteService,
        ISiteResolver resolver,
        CancellationToken ct)
    {
        var (found, error) = await siteService.DeleteSiteAsync(id, ct);
        if (!found)
            return Results.NotFound();
        if (error is not null)
            return Results.Conflict(new { error });

        resolver.InvalidateCache();
        return Results.NoContent();
    }

    private static async Task<IResult> GetSiteDomains(
        Guid id,
        SiteService siteService,
        CancellationToken ct)
    {
        var domains = await siteService.GetSiteDomainsAsync(id, ct);
        return Results.Ok(domains);
    }

    private static async Task<IResult> AddSiteDomain(
        Guid id,
        [FromBody] AddDomainRequest req,
        SiteService siteService,
        ISiteResolver resolver,
        CancellationToken ct)
    {
        var (valid, error, domain) = await siteService.AddSiteDomainAsync(id, req, ct);
        if (!valid)
        {
            return error == "Site not found"
                ? Results.NotFound()
                : Results.Conflict(new { error });
        }

        resolver.InvalidateCache();
        return Results.Created($"/admin/sites/{id}/domains/{domain!.Id}", new { domain.Id, domain.Domain });
    }

    private static async Task<IResult> RemoveSiteDomain(
        Guid id,
        Guid domainId,
        SiteService siteService,
        ISiteResolver resolver,
        CancellationToken ct)
    {
        var found = await siteService.RemoveSiteDomainAsync(id, domainId, ct);
        if (!found)
            return Results.NotFound();

        resolver.InvalidateCache();
        return Results.NoContent();
    }
}
