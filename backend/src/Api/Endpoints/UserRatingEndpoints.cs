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

        group.MapGet("/userbook/{userBookId:guid}", GetUserBookRating).WithName("GetUserBookRating");
        group.MapPut("/userbook/{userBookId:guid}", UpsertUserBookRating).WithName("UpsertUserBookRating");
        group.MapDelete("/userbook/{userBookId:guid}", DeleteUserBookRating).WithName("DeleteUserBookRating");
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
            .Select(r => new UserRatingDto(
                r.Id, r.EditionId, r.UserBookId, r.Rating, r.ReviewText, r.Title, r.IsSpoiler,
                r.HelpfulCount, r.Comments.Count, r.UpdatedAt,
                r.EditionId != null ? r.Edition!.Title : null,
                r.EditionId != null ? r.Edition!.Slug : null,
                r.EditionId != null ? r.Edition!.CoverPath : null,
                r.EditionId != null ? r.Edition!.Language : null,
                r.UserBookId != null ? r.UserBook!.Title : null))
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
            .Select(r => new UserRatingDto(
                r.Id, r.EditionId, r.UserBookId, r.Rating, r.ReviewText, r.Title, r.IsSpoiler,
                r.HelpfulCount, r.Comments.Count, r.UpdatedAt,
                r.Edition!.Title, r.Edition.Slug, r.Edition.CoverPath, r.Edition.Language, null))
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

        if (request.Rating < 0.5 || request.Rating > 5 || request.Rating % 0.5 != 0)
            return Results.BadRequest("Rating must be 0.5-5 in half-star increments");

        if (request.Title?.Length > 200)
            return Results.BadRequest("Title must be 200 characters or less");

        var existing = await db.UserRatings
            .Include(r => r.Edition)
            .FirstOrDefaultAsync(r => r.UserId == userId.Value && r.SiteId == siteId && r.EditionId == editionId, ct);

        if (existing != null)
        {
            existing.Rating = request.Rating;
            existing.ReviewText = request.ReviewText;
            existing.Title = request.Title;
            existing.IsSpoiler = request.IsSpoiler;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }
        else
        {
            var edition = await db.Editions.FirstOrDefaultAsync(e => e.Id == editionId, ct);
            if (edition == null) return Results.NotFound();

            existing = new UserRating
            {
                Id = Guid.NewGuid(),
                UserId = userId.Value,
                SiteId = siteId,
                EditionId = editionId,
                Rating = request.Rating,
                ReviewText = request.ReviewText,
                Title = request.Title,
                IsSpoiler = request.IsSpoiler,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
                Edition = edition,
            };
            db.UserRatings.Add(existing);
        }

        await db.SaveChangesAsync(ct);

        var commentCount = await db.ReviewComments.CountAsync(c => c.UserRatingId == existing.Id, ct);
        return Results.Ok(new UserRatingDto(
            existing.Id, existing.EditionId, existing.UserBookId, existing.Rating, existing.ReviewText,
            existing.Title, existing.IsSpoiler, existing.HelpfulCount, commentCount,
            existing.UpdatedAt, existing.Edition?.Title, existing.Edition?.Slug,
            existing.Edition?.CoverPath, existing.Edition?.Language, null));
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

    // --- User book rating endpoints ---

    private static async Task<IResult> GetUserBookRating(
        Guid userBookId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var rating = await db.UserRatings
            .Where(r => r.UserId == userId.Value && r.SiteId == siteId && r.UserBookId == userBookId)
            .Select(r => new UserRatingDto(
                r.Id, r.EditionId, r.UserBookId, r.Rating, r.ReviewText, r.Title, r.IsSpoiler,
                r.HelpfulCount, r.Comments.Count, r.UpdatedAt,
                null, null, null, null, r.UserBook!.Title))
            .FirstOrDefaultAsync(ct);

        if (rating == null) return Results.NotFound();
        return Results.Ok(rating);
    }

    private static async Task<IResult> UpsertUserBookRating(
        Guid userBookId,
        [FromBody] UpsertRatingRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        if (request.Rating < 0.5 || request.Rating > 5 || request.Rating % 0.5 != 0)
            return Results.BadRequest("Rating must be 0.5-5 in half-star increments");

        if (request.Title?.Length > 200)
            return Results.BadRequest("Title must be 200 characters or less");

        var userBook = await db.UserBooks.FirstOrDefaultAsync(b => b.Id == userBookId && b.UserId == userId.Value, ct);
        if (userBook == null) return Results.NotFound("User book not found");

        var existing = await db.UserRatings
            .FirstOrDefaultAsync(r => r.UserId == userId.Value && r.SiteId == siteId && r.UserBookId == userBookId, ct);

        if (existing != null)
        {
            existing.Rating = request.Rating;
            existing.ReviewText = request.ReviewText;
            existing.Title = request.Title;
            existing.IsSpoiler = request.IsSpoiler;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }
        else
        {
            existing = new UserRating
            {
                Id = Guid.NewGuid(),
                UserId = userId.Value,
                SiteId = siteId,
                UserBookId = userBookId,
                Rating = request.Rating,
                ReviewText = request.ReviewText,
                Title = request.Title,
                IsSpoiler = request.IsSpoiler,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
            };
            db.UserRatings.Add(existing);
        }

        await db.SaveChangesAsync(ct);

        return Results.Ok(new UserRatingDto(
            existing.Id, existing.EditionId, existing.UserBookId, existing.Rating, existing.ReviewText,
            existing.Title, existing.IsSpoiler, existing.HelpfulCount, 0,
            existing.UpdatedAt, null, null, null, null, userBook.Title));
    }

    private static async Task<IResult> DeleteUserBookRating(
        Guid userBookId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var rating = await db.UserRatings
            .FirstOrDefaultAsync(r => r.UserId == userId.Value && r.SiteId == siteId && r.UserBookId == userBookId, ct);

        if (rating == null) return Results.NotFound();

        db.UserRatings.Remove(rating);
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public record UpsertRatingRequest(double Rating, string? ReviewText, string? Title = null, bool IsSpoiler = false);
public record UserRatingDto(
    Guid Id, Guid? EditionId, Guid? UserBookId, double Rating, string? ReviewText,
    string? Title, bool IsSpoiler, int HelpfulCount, int CommentCount,
    DateTimeOffset UpdatedAt,
    string? EditionTitle = null, string? EditionSlug = null,
    string? EditionCoverPath = null, string? EditionLanguage = null,
    string? UserBookTitle = null);
