using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class ReviewEndpoints
{
    public static void MapReviewEndpoints(this WebApplication app)
    {
        // Public
        var publicGroup = app.MapGroup("/books/{editionId:guid}/reviews").WithTags("Reviews");
        publicGroup.MapGet("", GetBookReviews).WithName("GetBookReviews");
        publicGroup.MapGet("/stats", GetBookReviewStats).WithName("GetBookReviewStats");
        publicGroup.MapGet("/{reviewId:guid}/comments", GetReviewComments).WithName("GetReviewComments");

        // Authenticated
        var meGroup = app.MapGroup("/me/reviews").WithTags("Reviews");
        meGroup.MapPost("/{reviewId:guid}/like", LikeReview).WithName("LikeReview");
        meGroup.MapDelete("/{reviewId:guid}/like", UnlikeReview).WithName("UnlikeReview");
        meGroup.MapPost("/{reviewId:guid}/comments", AddComment).WithName("AddReviewComment");
        meGroup.MapDelete("/comments/{commentId:guid}", DeleteComment).WithName("DeleteReviewComment");
    }

    private static async Task<IResult> GetBookReviews(
        Guid editionId,
        [FromQuery] string? sort,
        [FromQuery] int? rating,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var siteId = httpContext.GetSiteId();
        var userId = httpContext.GetUserId(authService); // nullable, for isLikedByMe

        var query = db.UserRatings
            .Where(r => r.EditionId == editionId && r.SiteId == siteId && r.ReviewText != null);

        if (rating.HasValue)
        {
            var r = (double)rating.Value;
            query = query.Where(x => x.Rating >= r && x.Rating < r + 1);
        }

        var total = await query.CountAsync(ct);

        var ordered = sort switch
        {
            "newest" => query.OrderByDescending(r => r.CreatedAt),
            "oldest" => query.OrderBy(r => r.CreatedAt),
            _ => query.OrderByDescending(r => r.HelpfulCount).ThenByDescending(r => r.CreatedAt), // popular
        };

        var items = await ordered
            .Skip(offset ?? 0)
            .Take(Math.Min(limit ?? 10, 50))
            .Select(r => new PublicReviewDto(
                r.Id, r.UserId, r.User.Name, r.User.Picture,
                r.Rating, r.Title, r.ReviewText!, r.IsSpoiler,
                r.HelpfulCount, r.Comments.Count, r.CreatedAt,
                userId.HasValue && r.Likes.Any(l => l.UserId == userId.Value)))
            .ToListAsync(ct);

        return Results.Ok(new ReviewListResponse(total, items));
    }

    private static async Task<IResult> GetBookReviewStats(
        Guid editionId,
        HttpContext httpContext,
        IAppDbContext db,
        CancellationToken ct)
    {
        var siteId = httpContext.GetSiteId();

        var ratings = await db.UserRatings
            .Where(r => r.EditionId == editionId && r.SiteId == siteId)
            .Select(r => new { r.Rating, HasReview = r.ReviewText != null })
            .ToListAsync(ct);

        if (ratings.Count == 0)
            return Results.Ok(new ReviewStatsDto(0, 0, 0, new RatingDistribution(0, 0, 0, 0, 0)));

        var avgRating = Math.Round(ratings.Average(r => r.Rating), 1);
        var totalReviews = ratings.Count(r => r.HasReview);

        var dist = new RatingDistribution(
            ratings.Count(r => r.Rating >= 4.5),
            ratings.Count(r => r.Rating >= 3.5 && r.Rating < 4.5),
            ratings.Count(r => r.Rating >= 2.5 && r.Rating < 3.5),
            ratings.Count(r => r.Rating >= 1.5 && r.Rating < 2.5),
            ratings.Count(r => r.Rating < 1.5));

        return Results.Ok(new ReviewStatsDto(avgRating, ratings.Count, totalReviews, dist));
    }

    private static async Task<IResult> LikeReview(
        Guid reviewId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var review = await db.UserRatings.FirstOrDefaultAsync(r => r.Id == reviewId, ct);
        if (review == null) return Results.NotFound();

        var existing = await db.ReviewLikes
            .FirstOrDefaultAsync(l => l.UserRatingId == reviewId && l.UserId == userId.Value, ct);

        if (existing != null)
            return Results.Ok(new LikeResponse(true, review.HelpfulCount));

        db.ReviewLikes.Add(new ReviewLike
        {
            Id = Guid.NewGuid(),
            UserRatingId = reviewId,
            UserId = userId.Value,
            SiteId = siteId,
            CreatedAt = DateTimeOffset.UtcNow,
        });
        review.HelpfulCount++;
        await db.SaveChangesAsync(ct);

        return Results.Ok(new LikeResponse(true, review.HelpfulCount));
    }

    private static async Task<IResult> UnlikeReview(
        Guid reviewId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var review = await db.UserRatings.FirstOrDefaultAsync(r => r.Id == reviewId, ct);
        if (review == null) return Results.NotFound();

        var existing = await db.ReviewLikes
            .FirstOrDefaultAsync(l => l.UserRatingId == reviewId && l.UserId == userId.Value, ct);

        if (existing == null)
            return Results.Ok(new LikeResponse(false, review.HelpfulCount));

        db.ReviewLikes.Remove(existing);
        review.HelpfulCount = Math.Max(0, review.HelpfulCount - 1);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new LikeResponse(false, review.HelpfulCount));
    }

    private static async Task<IResult> GetReviewComments(
        Guid editionId,
        Guid reviewId,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        IAppDbContext db,
        CancellationToken ct)
    {
        var total = await db.ReviewComments
            .Where(c => c.UserRatingId == reviewId)
            .CountAsync(ct);

        var items = await db.ReviewComments
            .Where(c => c.UserRatingId == reviewId)
            .OrderBy(c => c.CreatedAt)
            .Skip(offset ?? 0)
            .Take(Math.Min(limit ?? 20, 50))
            .Select(c => new CommentDto(c.Id, c.UserId, c.User.Name, c.User.Picture, c.Text, c.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(new CommentListResponse(total, items));
    }

    private static async Task<IResult> AddComment(
        Guid reviewId,
        [FromBody] AddCommentRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        if (string.IsNullOrWhiteSpace(request.Text))
            return Results.BadRequest("Comment text is required");
        if (request.Text.Length > 2000)
            return Results.BadRequest("Comment must be 2000 characters or less");

        var review = await db.UserRatings.AnyAsync(r => r.Id == reviewId, ct);
        if (!review) return Results.NotFound();

        var comment = new ReviewComment
        {
            Id = Guid.NewGuid(),
            UserRatingId = reviewId,
            UserId = userId.Value,
            SiteId = siteId,
            Text = request.Text.Trim(),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        };
        db.ReviewComments.Add(comment);
        await db.SaveChangesAsync(ct);

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId.Value, ct);
        return Results.Ok(new CommentDto(comment.Id, comment.UserId, user?.Name, user?.Picture, comment.Text, comment.CreatedAt));
    }

    private static async Task<IResult> DeleteComment(
        Guid commentId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var comment = await db.ReviewComments.FirstOrDefaultAsync(c => c.Id == commentId, ct);
        if (comment == null) return Results.NotFound();
        if (comment.UserId != userId.Value) return Results.Forbid();

        db.ReviewComments.Remove(comment);
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

// DTOs
public record PublicReviewDto(
    Guid Id, Guid UserId, string? UserName, string? UserPicture,
    double Rating, string? Title, string ReviewText, bool IsSpoiler,
    int HelpfulCount, int CommentCount, DateTimeOffset CreatedAt, bool IsLikedByMe);

public record ReviewListResponse(int Total, List<PublicReviewDto> Items);

public record ReviewStatsDto(double AvgRating, int TotalRatings, int TotalReviews, RatingDistribution Distribution);
public record RatingDistribution(int Star5, int Star4, int Star3, int Star2, int Star1);

public record LikeResponse(bool Liked, int HelpfulCount);

public record CommentDto(Guid Id, Guid UserId, string? UserName, string? UserPicture, string Text, DateTimeOffset CreatedAt);
public record CommentListResponse(int Total, List<CommentDto> Items);
public record AddCommentRequest(string Text);
