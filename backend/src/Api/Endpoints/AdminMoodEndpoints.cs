using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Api.Sites;

namespace Api.Endpoints;

public static class AdminMoodEndpoints
{
    public static void MapAdminMoodEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/admin/moods").WithTags("Admin Moods");

        group.MapGet("/", GetAll).WithName("AdminGetMoods");
        group.MapPost("/", Create).WithName("AdminCreateMood");
        group.MapPut("/{id:guid}", Update).WithName("AdminUpdateMood");
        group.MapDelete("/{id:guid}", Delete).WithName("AdminDeleteMood");
    }

    private static async Task<IResult> GetAll(
        HttpContext httpContext,
        IAppDbContext db,
        CancellationToken ct)
    {
        var siteId = httpContext.GetSiteId();

        var moods = await db.Moods
            .Where(m => m.SiteId == siteId)
            .OrderBy(m => m.SortOrder)
            .Select(m => new AdminMoodDto(m.Id, m.Slug, m.Name, m.Emoji, m.SortOrder, m.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(moods);
    }

    private static async Task<IResult> Create(
        [FromBody] CreateMoodRequest request,
        HttpContext httpContext,
        IAppDbContext db,
        CancellationToken ct)
    {
        var siteId = httpContext.GetSiteId();
        var slug = request.Name.ToLowerInvariant().Replace(' ', '-');

        var exists = await db.Moods.AnyAsync(m => m.SiteId == siteId && m.Slug == slug, ct);
        if (exists) return Results.Conflict("Mood with this name already exists");

        var maxOrder = await db.Moods
            .Where(m => m.SiteId == siteId)
            .MaxAsync(m => (int?)m.SortOrder, ct) ?? 0;

        var mood = new Mood
        {
            Id = Guid.NewGuid(),
            SiteId = siteId,
            Slug = slug,
            Name = request.Name,
            Emoji = request.Emoji,
            SortOrder = maxOrder + 1,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        db.Moods.Add(mood);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new AdminMoodDto(mood.Id, mood.Slug, mood.Name, mood.Emoji, mood.SortOrder, mood.CreatedAt));
    }

    private static async Task<IResult> Update(
        Guid id,
        [FromBody] UpdateMoodRequest request,
        HttpContext httpContext,
        IAppDbContext db,
        CancellationToken ct)
    {
        var siteId = httpContext.GetSiteId();
        var mood = await db.Moods.FirstOrDefaultAsync(m => m.Id == id && m.SiteId == siteId, ct);
        if (mood == null) return Results.NotFound();

        if (request.Name != null) { mood.Name = request.Name; mood.Slug = request.Name.ToLowerInvariant().Replace(' ', '-'); }
        if (request.Emoji != null) mood.Emoji = request.Emoji;
        if (request.SortOrder.HasValue) mood.SortOrder = request.SortOrder.Value;

        await db.SaveChangesAsync(ct);

        return Results.Ok(new AdminMoodDto(mood.Id, mood.Slug, mood.Name, mood.Emoji, mood.SortOrder, mood.CreatedAt));
    }

    private static async Task<IResult> Delete(
        Guid id,
        HttpContext httpContext,
        IAppDbContext db,
        CancellationToken ct)
    {
        var siteId = httpContext.GetSiteId();
        var mood = await db.Moods.FirstOrDefaultAsync(m => m.Id == id && m.SiteId == siteId, ct);
        if (mood == null) return Results.NotFound();

        // Check if any user tags reference this mood
        var hasUsage = await db.UserMoodTags.AnyAsync(t => t.MoodId == id, ct);
        if (hasUsage) return Results.BadRequest("Cannot delete mood with existing user tags");

        db.Moods.Remove(mood);
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public record AdminMoodDto(Guid Id, string Slug, string Name, string? Emoji, int SortOrder, DateTimeOffset CreatedAt);
public record CreateMoodRequest(string Name, string? Emoji);
public record UpdateMoodRequest(string? Name, string? Emoji, int? SortOrder);
