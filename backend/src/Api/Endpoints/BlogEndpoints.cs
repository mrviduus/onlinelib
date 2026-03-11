using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.Common.Interfaces;
using Contracts.Blog;
using Domain.Entities;
using Domain.Enums;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class BlogEndpoints
{
    public static void MapBlogEndpoints(this WebApplication app)
    {
        // Public
        var publicGroup = app.MapGroup("/blog").WithTags("Blog");
        publicGroup.MapGet("", GetPosts).WithName("GetBlogPosts");
        publicGroup.MapGet("/{slug}", GetPost).WithName("GetBlogPost");
        publicGroup.MapGet("/{postId:guid}/comments", GetComments).WithName("GetBlogComments");

        // Authenticated
        var meGroup = app.MapGroup("/me/blog").WithTags("Blog");
        meGroup.MapPost("/{postId:guid}/like", LikePost).WithName("LikeBlogPost");
        meGroup.MapDelete("/{postId:guid}/like", UnlikePost).WithName("UnlikeBlogPost");
        meGroup.MapPost("/{postId:guid}/comments", AddComment).WithName("AddBlogComment");
        meGroup.MapDelete("/comments/{commentId:guid}", DeleteComment).WithName("DeleteBlogComment");
    }

    private static async Task<IResult> GetPosts(
        [FromQuery] string? language,
        [FromQuery] string? tag,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        HttpContext httpContext,
        IAppDbContext db,
        CancellationToken ct)
    {
        var siteId = httpContext.GetSiteId();

        var query = db.BlogPosts
            .Where(p => p.SiteId == siteId && p.Status == BlogPostStatus.Published);

        if (!string.IsNullOrWhiteSpace(language))
            query = query.Where(p => p.Language == language);

        if (!string.IsNullOrWhiteSpace(tag))
            query = query.Where(p => p.Tags != null && p.Tags.Contains(tag));

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(p => p.PublishedAt)
            .Skip(offset ?? 0)
            .Take(Math.Min(limit ?? 10, 50))
            .Select(p => new BlogPostListItemDto(
                p.Id, p.Slug, p.Title, p.Excerpt, p.CoverImagePath,
                p.AuthorName, p.Tags, p.Language,
                p.LikeCount, p.CommentCount, p.ViewCount, p.PublishedAt))
            .ToListAsync(ct);

        return Results.Ok(new BlogPostListResponse(total, items));
    }

    private static async Task<IResult> GetPost(
        string slug,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var siteId = httpContext.GetSiteId();
        var userId = httpContext.GetUserId(authService);

        var post = await db.BlogPosts
            .Where(p => p.Slug == slug && p.SiteId == siteId && p.Status == BlogPostStatus.Published)
            .Select(p => new
            {
                p.Id,
                p.Slug,
                p.Title,
                p.Content,
                p.Excerpt,
                p.CoverImagePath,
                p.AuthorName,
                p.Tags,
                p.Language,
                p.SeoTitle,
                p.SeoDescription,
                p.LikeCount,
                p.CommentCount,
                p.ViewCount,
                p.PublishedAt,
                IsLikedByMe = userId.HasValue && p.Likes.Any(l => l.UserId == userId.Value),
            })
            .FirstOrDefaultAsync(ct);

        if (post is null) return Results.NotFound();

        // Increment view count (fire-and-forget)
        await db.BlogPosts
            .Where(p => p.Id == post.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.ViewCount, p => p.ViewCount + 1), ct);

        return Results.Ok(new BlogPostDetailDto(
            post.Id, post.Slug, post.Title, post.Content, post.Excerpt, post.CoverImagePath,
            post.AuthorName, post.Tags, post.Language, post.SeoTitle, post.SeoDescription,
            post.LikeCount, post.CommentCount, post.ViewCount,
            post.IsLikedByMe, post.PublishedAt));
    }

    private static async Task<IResult> GetComments(
        Guid postId,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        IAppDbContext db,
        CancellationToken ct)
    {
        // Get top-level comments only (replies loaded nested)
        var total = await db.BlogComments
            .Where(c => c.BlogPostId == postId && c.ParentCommentId == null)
            .CountAsync(ct);

        var items = await db.BlogComments
            .Where(c => c.BlogPostId == postId && c.ParentCommentId == null)
            .OrderBy(c => c.CreatedAt)
            .Skip(offset ?? 0)
            .Take(Math.Min(limit ?? 20, 50))
            .Select(c => new BlogCommentDto(
                c.Id, c.UserId, c.User.Name, c.User.Picture, c.Text, c.ParentCommentId,
                c.Replies.OrderBy(r => r.CreatedAt).Select(r => new BlogCommentDto(
                    r.Id, r.UserId, r.User.Name, r.User.Picture, r.Text, r.ParentCommentId,
                    null, r.CreatedAt)).ToList(),
                c.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(new BlogCommentListResponse(total, items));
    }

    private static async Task<IResult> LikePost(
        Guid postId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var post = await db.BlogPosts.FirstOrDefaultAsync(p => p.Id == postId, ct);
        if (post == null) return Results.NotFound();

        var existing = await db.BlogLikes
            .FirstOrDefaultAsync(l => l.BlogPostId == postId && l.UserId == userId.Value, ct);

        if (existing != null)
            return Results.Ok(new BlogLikeResponse(true, post.LikeCount));

        db.BlogLikes.Add(new BlogLike
        {
            Id = Guid.NewGuid(),
            BlogPostId = postId,
            UserId = userId.Value,
            SiteId = siteId,
            CreatedAt = DateTimeOffset.UtcNow,
        });
        post.LikeCount++;
        await db.SaveChangesAsync(ct);

        return Results.Ok(new BlogLikeResponse(true, post.LikeCount));
    }

    private static async Task<IResult> UnlikePost(
        Guid postId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var post = await db.BlogPosts.FirstOrDefaultAsync(p => p.Id == postId, ct);
        if (post == null) return Results.NotFound();

        var existing = await db.BlogLikes
            .FirstOrDefaultAsync(l => l.BlogPostId == postId && l.UserId == userId.Value, ct);

        if (existing == null)
            return Results.Ok(new BlogLikeResponse(false, post.LikeCount));

        db.BlogLikes.Remove(existing);
        post.LikeCount = Math.Max(0, post.LikeCount - 1);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new BlogLikeResponse(false, post.LikeCount));
    }

    private static async Task<IResult> AddComment(
        Guid postId,
        [FromBody] AddBlogCommentRequest request,
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

        var postExists = await db.BlogPosts.AnyAsync(p => p.Id == postId && p.Status == BlogPostStatus.Published, ct);
        if (!postExists) return Results.NotFound();

        // Enforce 2-level nesting: parent must be top-level
        if (request.ParentCommentId.HasValue)
        {
            var parent = await db.BlogComments.FirstOrDefaultAsync(c => c.Id == request.ParentCommentId.Value, ct);
            if (parent == null) return Results.BadRequest("Parent comment not found");
            if (parent.ParentCommentId != null) return Results.BadRequest("Cannot reply to a reply");
        }

        var comment = new BlogComment
        {
            Id = Guid.NewGuid(),
            BlogPostId = postId,
            UserId = userId.Value,
            SiteId = siteId,
            Text = request.Text.Trim(),
            ParentCommentId = request.ParentCommentId,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        };
        db.BlogComments.Add(comment);

        // Update denormalized count
        await db.BlogPosts
            .Where(p => p.Id == postId)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.CommentCount, p => p.CommentCount + 1), ct);

        await db.SaveChangesAsync(ct);

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId.Value, ct);
        return Results.Ok(new BlogCommentDto(
            comment.Id, comment.UserId, user?.Name, user?.Picture,
            comment.Text, comment.ParentCommentId, null, comment.CreatedAt));
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

        var comment = await db.BlogComments
            .Include(c => c.Replies)
            .FirstOrDefaultAsync(c => c.Id == commentId, ct);
        if (comment == null) return Results.NotFound();
        if (comment.UserId != userId.Value) return Results.Forbid();

        var deleteCount = 1 + comment.Replies.Count;
        db.BlogComments.Remove(comment);

        // Update denormalized count
        await db.BlogPosts
            .Where(p => p.Id == comment.BlogPostId)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.CommentCount, p => Math.Max(0, p.CommentCount - deleteCount)), ct);

        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}
