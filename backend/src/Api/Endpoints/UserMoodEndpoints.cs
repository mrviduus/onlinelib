using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class UserMoodEndpoints
{
    public static void MapUserMoodEndpoints(this WebApplication app)
    {
        // Public: list all moods
        app.MapGet("/moods", GetAllMoods).WithTags("Moods").WithName("GetAllMoods");

        var group = app.MapGroup("/me/moods").WithTags("User Moods");
        group.MapGet("/", GetUserMoodTags).WithName("GetUserMoodTags");
        group.MapGet("/{editionId:guid}", GetMoodsForEdition).WithName("GetMoodsForEdition");
        group.MapPut("/{editionId:guid}", SetMoodsForEdition).WithName("SetMoodsForEdition");
        group.MapGet("/userbook/{userBookId:guid}", GetMoodsForUserBook).WithName("GetMoodsForUserBook");
        group.MapPut("/userbook/{userBookId:guid}", SetMoodsForUserBook).WithName("SetMoodsForUserBook");
    }

    private static async Task<IResult> GetAllMoods(
        HttpContext httpContext,
        IAppDbContext db,
        CancellationToken ct)
    {
        var siteId = httpContext.GetSiteId();

        var moods = await db.Moods
            .Where(m => m.SiteId == siteId)
            .OrderBy(m => m.SortOrder)
            .Select(m => new MoodDto(m.Id, m.Slug, m.Name, m.Emoji))
            .ToListAsync(ct);

        return Results.Ok(moods);
    }

    private static async Task<IResult> GetUserMoodTags(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var tags = await db.UserMoodTags
            .Where(t => t.UserId == userId.Value && t.SiteId == siteId)
            .Join(db.Moods, t => t.MoodId, m => m.Id, (t, m) => new { t.EditionId, t.UserBookId, t.MoodId, m.Slug, m.Name, m.Emoji })
            .ToListAsync(ct);

        var grouped = tags
            .GroupBy(t => new { t.EditionId, t.UserBookId })
            .Select(g => new UserMoodTagsDto(
                g.Key.EditionId,
                g.Key.UserBookId,
                g.Select(t => new MoodDto(t.MoodId, t.Slug, t.Name, t.Emoji)).ToList()))
            .ToList();

        return Results.Ok(grouped);
    }

    private static async Task<IResult> GetMoodsForEdition(
        Guid editionId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var moodIds = await db.UserMoodTags
            .Where(t => t.UserId == userId.Value && t.SiteId == siteId && t.EditionId == editionId)
            .Select(t => t.MoodId)
            .ToListAsync(ct);

        return Results.Ok(moodIds);
    }

    private static async Task<IResult> SetMoodsForEdition(
        Guid editionId,
        [FromBody] SetMoodsRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        if (request.MoodIds.Count > 5)
            return Results.BadRequest("Maximum 5 moods per book");

        var existing = await db.UserMoodTags
            .Where(t => t.UserId == userId.Value && t.SiteId == siteId && t.EditionId == editionId)
            .ToListAsync(ct);
        db.UserMoodTags.RemoveRange(existing);

        foreach (var moodId in request.MoodIds.Distinct())
        {
            db.UserMoodTags.Add(new UserMoodTag
            {
                Id = Guid.NewGuid(),
                UserId = userId.Value,
                SiteId = siteId,
                EditionId = editionId,
                MoodId = moodId,
                CreatedAt = DateTimeOffset.UtcNow,
            });
        }

        await db.SaveChangesAsync(ct);
        return Results.Ok(request.MoodIds);
    }

    private static async Task<IResult> GetMoodsForUserBook(
        Guid userBookId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var owns = await db.UserBooks.AnyAsync(b => b.Id == userBookId && b.UserId == userId.Value, ct);
        if (!owns) return Results.NotFound();

        var moodIds = await db.UserMoodTags
            .Where(t => t.UserId == userId.Value && t.SiteId == siteId && t.UserBookId == userBookId)
            .Select(t => t.MoodId)
            .ToListAsync(ct);

        return Results.Ok(moodIds);
    }

    private static async Task<IResult> SetMoodsForUserBook(
        Guid userBookId,
        [FromBody] SetMoodsRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        if (request.MoodIds.Count > 5)
            return Results.BadRequest("Maximum 5 moods per book");

        var owns = await db.UserBooks.AnyAsync(b => b.Id == userBookId && b.UserId == userId.Value, ct);
        if (!owns) return Results.NotFound();

        var existing = await db.UserMoodTags
            .Where(t => t.UserId == userId.Value && t.SiteId == siteId && t.UserBookId == userBookId)
            .ToListAsync(ct);
        db.UserMoodTags.RemoveRange(existing);

        foreach (var moodId in request.MoodIds.Distinct())
        {
            db.UserMoodTags.Add(new UserMoodTag
            {
                Id = Guid.NewGuid(),
                UserId = userId.Value,
                SiteId = siteId,
                UserBookId = userBookId,
                MoodId = moodId,
                CreatedAt = DateTimeOffset.UtcNow,
            });
        }

        await db.SaveChangesAsync(ct);
        return Results.Ok(request.MoodIds);
    }
}

public record MoodDto(Guid Id, string Slug, string Name, string? Emoji);
public record UserMoodTagsDto(Guid? EditionId, Guid? UserBookId, List<MoodDto> Moods);
public record SetMoodsRequest(List<Guid> MoodIds);
