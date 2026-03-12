using Application.Common.Interfaces;
using Contracts.Blog;
using Domain.Entities;
using Domain.Enums;
using Domain.Utilities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class AdminBlogEndpoints
{
    public static void MapAdminBlogEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/admin/blog").WithTags("Admin Blog");

        group.MapGet("/", GetAll).WithName("AdminGetBlogPosts");
        group.MapGet("/stats", GetStats).WithName("AdminGetBlogStats");
        group.MapGet("/{id:guid}", GetById).WithName("AdminGetBlogPost");
        group.MapPost("/", Create).WithName("AdminCreateBlogPost");
        group.MapPut("/{id:guid}", Update).WithName("AdminUpdateBlogPost");
        group.MapDelete("/{id:guid}", Delete).WithName("AdminDeleteBlogPost");
        group.MapPost("/{id:guid}/publish", Publish).WithName("AdminPublishBlogPost");
        group.MapPost("/{id:guid}/unpublish", Unpublish).WithName("AdminUnpublishBlogPost");
        group.MapPost("/{id:guid}/cover", UploadCover).WithName("AdminUploadBlogCover").DisableAntiforgery();
        group.MapDelete("/{id:guid}/cover", DeleteCover).WithName("AdminDeleteBlogCover");
    }

    private static async Task<IResult> GetAll(
        IAppDbContext db,
        [FromQuery] Guid siteId,
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] string? language,
        [FromQuery] int offset = 0,
        [FromQuery] int limit = 20,
        CancellationToken ct = default)
    {

        var query = db.BlogPosts.Where(p => p.SiteId == siteId);

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(p => p.Title.Contains(search) || p.AuthorName.Contains(search));

        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<BlogPostStatus>(status, true, out var s))
            query = query.Where(p => p.Status == s);

        if (!string.IsNullOrWhiteSpace(language))
            query = query.Where(p => p.Language == language);

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(p => p.CreatedAt)
            .Skip(offset)
            .Take(limit)
            .Select(p => new AdminBlogPostListItemDto(
                p.Id, p.Slug, p.Title, p.AuthorName, p.Language,
                p.Status.ToString(), p.LikeCount, p.CommentCount, p.ViewCount,
                p.PublishedAt, p.CreatedAt, p.UpdatedAt))
            .ToListAsync(ct);

        return Results.Ok(new AdminBlogPostListResponse(total, items));
    }

    private static async Task<IResult> GetStats(
        IAppDbContext db,
        [FromQuery] Guid siteId,
        CancellationToken ct)
    {

        var posts = db.BlogPosts.Where(p => p.SiteId == siteId);
        var total = await posts.CountAsync(ct);
        var published = await posts.CountAsync(p => p.Status == BlogPostStatus.Published, ct);
        var draft = total - published;
        var totalComments = await db.BlogComments.CountAsync(c => c.SiteId == siteId, ct);
        var totalLikes = await db.BlogLikes.CountAsync(l => l.SiteId == siteId, ct);

        return Results.Ok(new AdminBlogStatsDto(total, published, draft, totalComments, totalLikes));
    }

    private static async Task<IResult> GetById(
        Guid id,
        IAppDbContext db,
        [FromQuery] Guid siteId,
        CancellationToken ct)
    {

        var post = await db.BlogPosts
            .Where(p => p.Id == id && p.SiteId == siteId)
            .Select(p => new AdminBlogPostDetailDto(
                p.Id, p.Slug, p.Title, p.Content, p.Excerpt, p.CoverImagePath,
                p.AuthorName, p.Tags, p.Language, p.Status.ToString(),
                p.SeoTitle, p.SeoDescription,
                p.LikeCount, p.CommentCount, p.ViewCount,
                p.PublishedAt, p.CreatedAt, p.UpdatedAt))
            .FirstOrDefaultAsync(ct);

        return post is null ? Results.NotFound() : Results.Ok(post);
    }

    private static async Task<IResult> Create(
        [FromBody] CreateBlogPostRequest request,
        IAppDbContext db,
        [FromQuery] Guid siteId,
        CancellationToken ct)
    {

        if (string.IsNullOrWhiteSpace(request.Title))
            return Results.BadRequest("Title is required");
        if (string.IsNullOrWhiteSpace(request.Content))
            return Results.BadRequest("Content is required");

        var slug = SlugGenerator.GenerateSlug(request.Title);
        if (string.IsNullOrEmpty(slug))
            return Results.BadRequest("Cannot generate slug from title");

        // Ensure unique slug
        var baseSlug = slug;
        var counter = 1;
        while (await db.BlogPosts.AnyAsync(p => p.SiteId == siteId && p.Language == request.Language && p.Slug == slug, ct))
        {
            slug = $"{baseSlug}-{counter++}";
        }

        var now = DateTimeOffset.UtcNow;
        var post = new BlogPost
        {
            Id = Guid.NewGuid(),
            SiteId = siteId,
            Title = request.Title,
            Slug = slug,
            Content = request.Content,
            Excerpt = request.Excerpt,
            Language = request.Language ?? "en",
            AuthorName = request.AuthorName ?? "",
            Tags = request.Tags,
            SeoTitle = request.SeoTitle,
            SeoDescription = request.SeoDescription,
            Status = BlogPostStatus.Draft,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.BlogPosts.Add(post);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new AdminBlogPostDetailDto(
            post.Id, post.Slug, post.Title, post.Content, post.Excerpt, post.CoverImagePath,
            post.AuthorName, post.Tags, post.Language, post.Status.ToString(),
            post.SeoTitle, post.SeoDescription,
            post.LikeCount, post.CommentCount, post.ViewCount,
            post.PublishedAt, post.CreatedAt, post.UpdatedAt));
    }

    private static async Task<IResult> Update(
        Guid id,
        [FromBody] UpdateBlogPostRequest request,
        IAppDbContext db,
        [FromQuery] Guid siteId,
        CancellationToken ct)
    {
        var post = await db.BlogPosts.FirstOrDefaultAsync(p => p.Id == id && p.SiteId == siteId, ct);
        if (post is null) return Results.NotFound();

        if (string.IsNullOrWhiteSpace(request.Title))
            return Results.BadRequest("Title is required");

        // Regenerate slug if title changed
        if (post.Title != request.Title)
        {
            var slug = SlugGenerator.GenerateSlug(request.Title);
            var baseSlug = slug;
            var counter = 1;
            while (await db.BlogPosts.AnyAsync(p => p.SiteId == siteId && p.Language == (request.Language ?? post.Language) && p.Slug == slug && p.Id != id, ct))
            {
                slug = $"{baseSlug}-{counter++}";
            }
            post.Slug = slug;
        }

        post.Title = request.Title;
        post.Content = request.Content;
        post.Excerpt = request.Excerpt;
        post.AuthorName = request.AuthorName ?? post.AuthorName;
        post.Tags = request.Tags;
        post.Language = request.Language ?? post.Language;
        post.SeoTitle = request.SeoTitle;
        post.SeoDescription = request.SeoDescription;
        post.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        return Results.Ok(new AdminBlogPostDetailDto(
            post.Id, post.Slug, post.Title, post.Content, post.Excerpt, post.CoverImagePath,
            post.AuthorName, post.Tags, post.Language, post.Status.ToString(),
            post.SeoTitle, post.SeoDescription,
            post.LikeCount, post.CommentCount, post.ViewCount,
            post.PublishedAt, post.CreatedAt, post.UpdatedAt));
    }

    private static async Task<IResult> Delete(
        Guid id,
        IAppDbContext db,
        [FromQuery] Guid siteId,
        CancellationToken ct)
    {
        var post = await db.BlogPosts.FirstOrDefaultAsync(p => p.Id == id && p.SiteId == siteId, ct);
        if (post is null) return Results.NotFound();

        db.BlogPosts.Remove(post);
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    private static async Task<IResult> Publish(
        Guid id,
        IAppDbContext db,
        [FromQuery] Guid siteId,
        CancellationToken ct)
    {
        var post = await db.BlogPosts.FirstOrDefaultAsync(p => p.Id == id && p.SiteId == siteId, ct);
        if (post is null) return Results.NotFound();

        post.Status = BlogPostStatus.Published;
        post.PublishedAt ??= DateTimeOffset.UtcNow;
        post.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        return Results.Ok(new { status = "Published", publishedAt = post.PublishedAt });
    }

    private static async Task<IResult> Unpublish(
        Guid id,
        IAppDbContext db,
        [FromQuery] Guid siteId,
        CancellationToken ct)
    {
        var post = await db.BlogPosts.FirstOrDefaultAsync(p => p.Id == id && p.SiteId == siteId, ct);
        if (post is null) return Results.NotFound();

        post.Status = BlogPostStatus.Draft;
        post.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        return Results.Ok(new { status = "Draft" });
    }

    private static readonly string[] AllowedCoverExtensions = [".jpg", ".jpeg", ".png", ".webp"];
    private const long MaxCoverSize = 5 * 1024 * 1024; // 5MB

    private static async Task<IResult> UploadCover(
        Guid id,
        IFormFile file,
        IAppDbContext db,
        IFileStorageService storage,
        IImageOptimizer imageOptimizer,
        [FromQuery] Guid siteId,
        CancellationToken ct)
    {
        var post = await db.BlogPosts.FirstOrDefaultAsync(p => p.Id == id && p.SiteId == siteId, ct);
        if (post is null) return Results.NotFound();

        if (file.Length == 0) return Results.BadRequest("File is empty");
        if (file.Length > MaxCoverSize) return Results.BadRequest("File too large. Max 5MB");

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedCoverExtensions.Contains(ext))
            return Results.BadRequest("Invalid file type. Only JPG, PNG, WEBP allowed");

        // Delete old cover
        if (!string.IsNullOrEmpty(post.CoverImagePath))
            await storage.DeleteFileAsync(post.CoverImagePath, ct);

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);
        var mimeType = file.ContentType ?? "image/jpeg";
        var optimized = await imageOptimizer.OptimizeAsync(ms.ToArray(), mimeType, ct: ct);

        using var optimizedStream = new MemoryStream(optimized.Data);
        var fileName = $"blog-cover{optimized.Extension}";
        var relativePath = await storage.SaveFileAsync(post.Id, fileName, optimizedStream, ct);

        post.CoverImagePath = relativePath;
        post.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { coverImagePath = relativePath });
    }

    private static async Task<IResult> DeleteCover(
        Guid id,
        IAppDbContext db,
        IFileStorageService storage,
        [FromQuery] Guid siteId,
        CancellationToken ct)
    {
        var post = await db.BlogPosts.FirstOrDefaultAsync(p => p.Id == id && p.SiteId == siteId, ct);
        if (post is null) return Results.NotFound();

        if (!string.IsNullOrEmpty(post.CoverImagePath))
        {
            await storage.DeleteFileAsync(post.CoverImagePath, ct);
            post.CoverImagePath = null;
            post.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
        }

        return Results.NoContent();
    }
}
