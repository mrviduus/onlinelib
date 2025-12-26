using Application.Common.Interfaces;
using Contracts.Admin;
using Domain.Entities;
using Domain.Enums;
using Domain.Utilities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class AdminAuthorsEndpoints
{
    public static void MapAdminAuthorsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/admin/authors").WithTags("Admin Authors");

        group.MapGet("/search", SearchAuthors)
            .WithName("SearchAuthors")
            .WithDescription("Search authors by name for autocomplete");

        group.MapPost("", CreateAuthor)
            .WithName("CreateAuthor")
            .WithDescription("Create a new author or return existing if exact match");
    }

    private static async Task<IResult> SearchAuthors(
        IAppDbContext db,
        [FromQuery] string? q,
        [FromQuery] Guid? siteId,
        [FromQuery] int? limit,
        CancellationToken ct)
    {
        if (siteId is null)
            return Results.BadRequest(new { error = "siteId is required" });

        var take = Math.Min(limit ?? 10, 20);

        var query = db.Authors
            .Where(a => a.SiteId == siteId.Value);

        if (!string.IsNullOrWhiteSpace(q))
        {
            query = query.Where(a => EF.Functions.ILike(a.Name, $"%{q}%"));
        }

        var items = await query
            .OrderBy(a => a.Name)
            .Take(take)
            .Select(a => new AdminAuthorSearchResultDto(
                a.Id,
                a.Slug,
                a.Name,
                a.EditionAuthors.Count(ea => ea.Edition.Status == EditionStatus.Published)
            ))
            .ToListAsync(ct);

        return Results.Ok(items);
    }

    private static async Task<IResult> CreateAuthor(
        IAppDbContext db,
        [FromBody] CreateAuthorRequest req,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return Results.BadRequest(new { error = "Name is required" });

        var trimmedName = req.Name.Trim();

        // Check for existing author with exact name (case-insensitive)
        var existing = await db.Authors
            .FirstOrDefaultAsync(a => a.SiteId == req.SiteId && a.Name.ToLower() == trimmedName.ToLower(), ct);

        if (existing is not null)
        {
            return Results.Ok(new CreateAuthorResponse(existing.Id, existing.Slug, existing.Name, IsNew: false));
        }

        // Generate unique slug
        var baseSlug = SlugGenerator.GenerateSlug(trimmedName);
        var slug = baseSlug;
        var suffix = 2;

        while (await db.Authors.AnyAsync(a => a.SiteId == req.SiteId && a.Slug == slug, ct))
        {
            slug = $"{baseSlug}-{suffix}";
            suffix++;
        }

        var now = DateTimeOffset.UtcNow;
        var author = new Author
        {
            Id = Guid.NewGuid(),
            SiteId = req.SiteId,
            Slug = slug,
            Name = trimmedName,
            CreatedAt = now,
            UpdatedAt = now
        };

        db.Authors.Add(author);
        await db.SaveChangesAsync(ct);

        return Results.Created($"/admin/authors/{author.Id}",
            new CreateAuthorResponse(author.Id, author.Slug, author.Name, IsNew: true));
    }
}
