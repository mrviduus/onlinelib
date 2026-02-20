using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class UserRatingEndpoints
{
    public static void MapUserRatingEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/me/ratings").WithTags("User Ratings");

        group.MapGet("/", GetAllRatings).WithName("GetAllRatings");
        group.MapGet("/{editionId:guid}", GetRating).WithName("GetRating");
        group.MapPut("/{editionId:guid}", UpsertRating).WithName("UpsertRating");
        group.MapDelete("/{editionId:guid}", DeleteRating).WithName("DeleteRating");
    }

    private static async Task<IResult> GetAllRatings(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var ratings = await db.UserRatings
            .Where(r => r.UserId == userId.Value && r.SiteId == siteId)
            .OrderByDescending(r => r.UpdatedAt)
            .Select(r => new UserRatingDto(r.EditionId, r.Rating, r.ReviewText, r.UpdatedAt))
            .ToListAsync(ct);

        return Results.Ok(ratings);
    }

    private static async Task<IResult> GetRating(
        Guid editionId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var rating = await db.UserRatings
            .Where(r => r.UserId == userId.Value && r.SiteId == siteId && r.EditionId == editionId)
            .Select(r => new UserRatingDto(r.EditionId, r.Rating, r.ReviewText, r.UpdatedAt))
            .FirstOrDefaultAsync(ct);

        if (rating == null) return Results.NotFound();
        return Results.Ok(rating);
    }

    private static async Task<IResult> UpsertRating(
        Guid editionId,
        [FromBody] UpsertRatingRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        if (request.Rating < 1 || request.Rating > 5)
            return Results.BadRequest("Rating must be 1-5");

        var existing = await db.UserRatings
            .FirstOrDefaultAsync(r => r.UserId == userId.Value && r.SiteId == siteId && r.EditionId == editionId, ct);

        if (existing != null)
        {
            existing.Rating = request.Rating;
            existing.ReviewText = request.ReviewText;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }
        else
        {
            existing = new UserRating
            {
                Id = Guid.NewGuid(),
                UserId = userId.Value,
                SiteId = siteId,
                EditionId = editionId,
                Rating = request.Rating,
                ReviewText = request.ReviewText,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
            };
            db.UserRatings.Add(existing);
        }

        await db.SaveChangesAsync(ct);

        return Results.Ok(new UserRatingDto(existing.EditionId, existing.Rating, existing.ReviewText, existing.UpdatedAt));
    }

    private static async Task<IResult> DeleteRating(
        Guid editionId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var rating = await db.UserRatings
            .FirstOrDefaultAsync(r => r.UserId == userId.Value && r.SiteId == siteId && r.EditionId == editionId, ct);

        if (rating == null) return Results.NotFound();

        db.UserRatings.Remove(rating);
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public record UpsertRatingRequest(int Rating, string? ReviewText);
public record UserRatingDto(Guid EditionId, int Rating, string? ReviewText, DateTimeOffset UpdatedAt);
