using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.Common.Interfaces;
using Application.Highlights;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class HighlightsEndpoints
{
    public static void MapHighlightsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/me/highlights").WithTags("Highlights");

        group.MapGet("/all", GetAllHighlights).WithName("GetAllHighlights");
        group.MapGet("/review", GetHighlightsForReview).WithName("GetHighlightsForReview");
        group.MapPost("/review", MarkHighlightReviewed).WithName("MarkHighlightReviewed");
        group.MapGet("/userbook/{userBookId:guid}", GetUserBookHighlights).WithName("GetUserBookHighlights");
        group.MapGet("/{editionId:guid}", GetHighlights).WithName("GetHighlights");
        group.MapPost("", CreateHighlight).WithName("CreateHighlight");
        group.MapPut("/{id:guid}", UpdateHighlight).WithName("UpdateHighlight");
        group.MapDelete("/{id:guid}", DeleteHighlight).WithName("DeleteHighlight");

        // Ambient social layer
        group.MapPost("/{id:guid}/publish", PublishHighlight).WithName("PublishHighlight").RequireRateLimiting("highlight-publish");
        group.MapPost("/{id:guid}/like", LikeHighlight).WithName("LikeHighlight").RequireRateLimiting("highlight-like");
        group.MapDelete("/{id:guid}/like", UnlikeHighlight).WithName("UnlikeHighlight").RequireRateLimiting("highlight-like");
        group.MapPost("/{id:guid}/report", ReportHighlight).WithName("ReportHighlight").RequireRateLimiting("highlight-report");

        // Public hotspots (no auth required — guests included)
        app.MapGet("/books/{editionId:guid}/chapters/{chapterId:guid}/hotspots", GetHotspots)
            .WithTags("Highlights")
            .WithName("GetHighlightHotspots")
            .RequireRateLimiting("highlight-hotspots");
    }

    private static async Task<IResult> GetHighlights(
        Guid editionId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var siteId = httpContext.GetSiteId();

        var highlights = await db.Highlights
            .Where(h => h.UserId == userId.Value && h.SiteId == siteId && h.EditionId == editionId && !h.IsDeleted)
            .OrderByDescending(h => h.CreatedAt)
            .Select(h => new HighlightDto(
                h.Id, h.EditionId, h.ChapterId, h.UserBookId, h.UserChapterId,
                h.AnchorJson, h.Color, h.SelectedText, h.NoteText,
                h.Version, h.CreatedAt, h.UpdatedAt,
                h.IsPublic, h.LikeCount, h.PublishedAt
            ))
            .ToListAsync(ct);

        return Results.Ok(highlights);
    }

    private static async Task<IResult> GetUserBookHighlights(
        Guid userBookId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var siteId = httpContext.GetSiteId();

        // Verify user owns the book
        var owns = await db.UserBooks.AnyAsync(b => b.Id == userBookId && b.UserId == userId.Value, ct);
        if (!owns) return Results.NotFound();

        var highlights = await db.Highlights
            .Where(h => h.UserId == userId.Value && h.SiteId == siteId && h.UserBookId == userBookId && !h.IsDeleted)
            .OrderByDescending(h => h.CreatedAt)
            .Select(h => new HighlightDto(
                h.Id, h.EditionId, h.ChapterId, h.UserBookId, h.UserChapterId,
                h.AnchorJson, h.Color, h.SelectedText, h.NoteText,
                h.Version, h.CreatedAt, h.UpdatedAt,
                h.IsPublic, h.LikeCount, h.PublishedAt
            ))
            .ToListAsync(ct);

        return Results.Ok(highlights);
    }

    private static async Task<IResult> GetAllHighlights(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        [FromQuery] int limit = 50,
        [FromQuery] int offset = 0,
        [FromQuery] string? bookType = "all",
        [FromQuery] string? sort = "newest",
        [FromQuery] string? search = null,
        [FromQuery] string? color = null,
        CancellationToken ct = default)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var siteId = httpContext.GetSiteId();
        limit = Math.Clamp(limit, 1, 100);

        var query = db.Highlights
            .Where(h => h.UserId == userId.Value && h.SiteId == siteId && !h.IsDeleted);

        if (bookType == "edition")
            query = query.Where(h => h.EditionId != null);
        else if (bookType == "userbook")
            query = query.Where(h => h.UserBookId != null);

        if (!string.IsNullOrEmpty(search))
            query = query.Where(h => h.SelectedText.Contains(search) || (h.NoteText != null && h.NoteText.Contains(search)));

        if (!string.IsNullOrEmpty(color))
            query = query.Where(h => h.Color == color);

        var totalCount = await query.CountAsync(ct);

        query = sort == "oldest"
            ? query.OrderBy(h => h.CreatedAt)
            : query.OrderByDescending(h => h.CreatedAt);

        var highlights = await query
            .Skip(offset)
            .Take(limit)
            .Select(h => new HighlightListItemDto(
                h.Id,
                h.SelectedText,
                h.Color,
                h.NoteText,
                h.CreatedAt,
                h.EditionId,
                h.EditionId != null ? h.Edition!.Title : null,
                h.EditionId != null ? h.Edition!.Slug : null,
                h.EditionId != null ? h.Edition!.CoverPath : null,
                h.UserBookId,
                h.UserBookId != null ? h.UserBook!.Title : null,
                h.UserBookId != null ? h.UserBook!.CoverPath : null,
                h.ChapterId,
                h.UserChapterId,
                h.ChapterId != null ? h.Chapter!.Title : null,
                h.UserChapterId != null ? h.UserChapter!.Title : null,
                h.ChapterId != null ? h.Chapter!.Slug : null,
                h.UserChapterId != null ? h.UserChapter!.Slug : null,
                h.IsPublic,
                h.LikeCount
            ))
            .ToListAsync(ct);

        return Results.Ok(new { items = highlights, totalCount });
    }

    private static async Task<IResult> GetHighlightsForReview(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        [FromQuery] int limit = 10,
        CancellationToken ct = default)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var siteId = httpContext.GetSiteId();
        limit = Math.Clamp(limit, 1, 30);

        var cutoff = DateTimeOffset.UtcNow.AddHours(-24);

        var highlights = await db.Highlights
            .Where(h => h.UserId == userId.Value && h.SiteId == siteId && !h.IsDeleted
                && (h.LastReviewedAt == null || h.LastReviewedAt < cutoff))
            .OrderBy(h => h.LastReviewedAt ?? DateTimeOffset.MinValue) // least recently reviewed first
            .ThenBy(h => h.CreatedAt) // oldest first
            .Take(limit)
            .Select(h => new HighlightReviewDto(
                h.Id,
                h.SelectedText,
                h.Color,
                h.NoteText,
                h.EditionId != null ? h.Edition!.Title : (h.UserBookId != null ? h.UserBook!.Title : null),
                h.ChapterId != null ? h.Chapter!.Title : (h.UserChapterId != null ? h.UserChapter!.Title : null),
                h.LastReviewedAt
            ))
            .ToListAsync(ct);

        return Results.Ok(highlights);
    }

    private static async Task<IResult> MarkHighlightReviewed(
        [FromBody] MarkReviewedRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var highlight = await db.Highlights
            .Where(h => h.Id == request.HighlightId && h.UserId == userId.Value)
            .FirstOrDefaultAsync(ct);

        if (highlight == null) return Results.NotFound();

        highlight.LastReviewedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return Results.Ok();
    }

    private static async Task<IResult> CreateHighlight(
        [FromBody] CreateHighlightRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var siteId = httpContext.GetSiteId();

        bool isUserBook = request.UserBookId.HasValue;
        bool isEdition = request.EditionId.HasValue;

        if (isUserBook == isEdition) // must provide exactly one
            return Results.BadRequest("Provide either EditionId+ChapterId or UserBookId+UserChapterId");

        if (isEdition)
        {
            if (!request.ChapterId.HasValue)
                return Results.BadRequest("ChapterId required for edition highlights");

            var editionId = request.EditionId!.Value;
            var chapterId = request.ChapterId!.Value;
            var edition = await db.Editions
                .Where(e => e.Id == editionId && e.SiteId == siteId)
                .FirstOrDefaultAsync(ct);
            if (edition == null) return Results.NotFound("Edition not found");

            var chapter = await db.Chapters
                .Where(c => c.Id == chapterId && c.EditionId == editionId)
                .FirstOrDefaultAsync(ct);
            if (chapter == null) return Results.NotFound("Chapter not found");
        }
        else
        {
            if (!request.UserChapterId.HasValue)
                return Results.BadRequest("UserChapterId required for user book highlights");

            var userBook = await db.UserBooks
                .Where(b => b.Id == request.UserBookId!.Value && b.UserId == userId.Value)
                .FirstOrDefaultAsync(ct);
            if (userBook == null) return Results.NotFound("User book not found");

            var userChapterId = request.UserChapterId!.Value;
            var userChapter = await db.UserChapters
                .Where(c => c.Id == userChapterId && c.UserBookId == request.UserBookId!.Value)
                .FirstOrDefaultAsync(ct);
            if (userChapter == null) return Results.NotFound("User chapter not found");
        }

        var now = DateTimeOffset.UtcNow;
        var isPublic = request.IsPublic ?? false;
        var highlight = new Highlight
        {
            Id = Guid.NewGuid(),
            UserId = userId.Value,
            SiteId = siteId,
            EditionId = request.EditionId,
            ChapterId = request.ChapterId,
            UserBookId = request.UserBookId,
            UserChapterId = request.UserChapterId,
            AnchorJson = request.AnchorJson,
            Color = request.Color,
            SelectedText = request.SelectedText,
            NoteText = request.NoteText,
            Version = 1,
            CreatedAt = now,
            UpdatedAt = now,
            IsPublic = isPublic,
            PublishedAt = isPublic ? now : null,
        };

        db.Highlights.Add(highlight);
        await db.SaveChangesAsync(ct);

        return Results.Created($"/me/highlights/{highlight.Id}", ToDto(highlight));
    }

    private static async Task<IResult> UpdateHighlight(
        Guid id,
        [FromBody] UpdateHighlightRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var highlight = await db.Highlights
            .Where(h => h.Id == id && h.UserId == userId.Value)
            .FirstOrDefaultAsync(ct);

        if (highlight == null) return Results.NotFound();

        // Conflict resolution: only update if client version matches
        if (request.Version.HasValue && request.Version.Value != highlight.Version)
            return Results.Conflict(ToDto(highlight));

        if (request.Color != null)
            highlight.Color = request.Color;
        if (request.AnchorJson != null)
            highlight.AnchorJson = request.AnchorJson;
        if (request.SelectedText != null)
            highlight.SelectedText = request.SelectedText;
        if (request.NoteText != null)
            highlight.NoteText = request.NoteText;
        else if (request.RemoveNote)
            highlight.NoteText = null;

        if (request.IsPublic.HasValue && request.IsPublic.Value != highlight.IsPublic)
        {
            highlight.IsPublic = request.IsPublic.Value;
            if (request.IsPublic.Value)
                highlight.PublishedAt = DateTimeOffset.UtcNow;
        }

        highlight.Version++;
        highlight.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        return Results.Ok(ToDto(highlight));
    }

    private static async Task<IResult> DeleteHighlight(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var highlight = await db.Highlights
            .Where(h => h.Id == id && h.UserId == userId.Value)
            .FirstOrDefaultAsync(ct);

        if (highlight == null) return Results.NotFound();

        db.Highlights.Remove(highlight);
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    private static HighlightDto ToDto(Highlight h) => new(
        h.Id, h.EditionId, h.ChapterId, h.UserBookId, h.UserChapterId,
        h.AnchorJson, h.Color, h.SelectedText, h.NoteText,
        h.Version, h.CreatedAt, h.UpdatedAt,
        h.IsPublic, h.LikeCount, h.PublishedAt
    );

    private static async Task<IResult> GetHotspots(
        Guid editionId,
        Guid chapterId,
        HttpContext httpContext,
        AuthService authService,
        HighlightClusterService clusters,
        CancellationToken ct)
    {
        var siteId = httpContext.GetSiteId();
        var userId = httpContext.GetUserId(authService);
        var hotspots = await clusters.GetHotspotsForEditionChapterAsync(siteId, editionId, chapterId, userId, ct);
        return Results.Ok(hotspots);
    }

    private static async Task<IResult> PublishHighlight(
        Guid id,
        [FromBody] PublishHighlightRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var highlight = await db.Highlights
            .Where(h => h.Id == id && h.UserId == userId.Value && !h.IsDeleted)
            .FirstOrDefaultAsync(ct);
        if (highlight == null) return Results.NotFound();

        if (highlight.IsPublic != request.IsPublic)
        {
            highlight.IsPublic = request.IsPublic;
            if (request.IsPublic)
                highlight.PublishedAt = DateTimeOffset.UtcNow;
            highlight.UpdatedAt = DateTimeOffset.UtcNow;
            highlight.Version++;
            await db.SaveChangesAsync(ct);
        }

        return Results.Ok(ToDto(highlight));
    }

    private static async Task<IResult> LikeHighlight(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var highlight = await db.Highlights
            .Where(h => h.Id == id && h.IsPublic && !h.IsDeleted)
            .FirstOrDefaultAsync(ct);
        if (highlight == null) return Results.NotFound();
        if (highlight.UserId == userId.Value) return Results.BadRequest("Cannot like own highlight");

        var already = await db.HighlightLikes
            .AnyAsync(l => l.HighlightId == id && l.UserId == userId.Value, ct);
        if (already) return Results.Ok(new { likeCount = highlight.LikeCount, liked = true });

        db.HighlightLikes.Add(new HighlightLike
        {
            Id = Guid.NewGuid(),
            HighlightId = id,
            UserId = userId.Value,
            SiteId = siteId,
            CreatedAt = DateTimeOffset.UtcNow,
        });
        highlight.LikeCount++;
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { likeCount = highlight.LikeCount, liked = true });
    }

    private static async Task<IResult> UnlikeHighlight(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var like = await db.HighlightLikes
            .Where(l => l.HighlightId == id && l.UserId == userId.Value)
            .FirstOrDefaultAsync(ct);
        if (like == null) return Results.NotFound();

        var highlight = await db.Highlights.Where(h => h.Id == id).FirstOrDefaultAsync(ct);
        db.HighlightLikes.Remove(like);
        if (highlight != null && highlight.LikeCount > 0)
            highlight.LikeCount--;
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { likeCount = highlight?.LikeCount ?? 0, liked = false });
    }

    private static async Task<IResult> ReportHighlight(
        Guid id,
        [FromBody] ReportHighlightRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var allowedReasons = new[] { "spam", "offensive", "misinformation", "other" };
        if (!allowedReasons.Contains(request.Reason)) return Results.BadRequest("Invalid reason");
        if (request.Note != null && request.Note.Length > 500) return Results.BadRequest("Note too long");

        var highlightExists = await db.Highlights
            .AnyAsync(h => h.Id == id && h.IsPublic && !h.IsDeleted, ct);
        if (!highlightExists) return Results.NotFound();

        db.HighlightReports.Add(new HighlightReport
        {
            Id = Guid.NewGuid(),
            HighlightId = id,
            ReportedByUserId = userId.Value,
            SiteId = siteId,
            Reason = request.Reason,
            Note = request.Note,
            CreatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync(ct);

        return Results.Accepted();
    }
}

// DTOs
public record HighlightDto(
    Guid Id,
    Guid? EditionId,
    Guid? ChapterId,
    Guid? UserBookId,
    Guid? UserChapterId,
    string AnchorJson,
    string Color,
    string SelectedText,
    string? NoteText,
    int Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    bool IsPublic,
    int LikeCount,
    DateTimeOffset? PublishedAt
);

public record HighlightListItemDto(
    Guid Id,
    string SelectedText,
    string Color,
    string? NoteText,
    DateTimeOffset CreatedAt,
    Guid? EditionId,
    string? EditionTitle,
    string? EditionSlug,
    string? EditionCoverPath,
    Guid? UserBookId,
    string? UserBookTitle,
    string? UserBookCoverPath,
    Guid? ChapterId,
    Guid? UserChapterId,
    string? ChapterTitle,
    string? UserChapterTitle,
    string? ChapterSlug,
    string? UserChapterSlug,
    bool IsPublic,
    int LikeCount
);

public record HighlightReviewDto(
    Guid Id,
    string SelectedText,
    string Color,
    string? NoteText,
    string? BookTitle,
    string? ChapterTitle,
    DateTimeOffset? LastReviewedAt
);

public record CreateHighlightRequest(
    Guid? EditionId,
    Guid? ChapterId,
    string AnchorJson,
    string Color,
    string SelectedText,
    string? NoteText = null,
    Guid? UserBookId = null,
    Guid? UserChapterId = null,
    bool? IsPublic = null
);

public record MarkReviewedRequest(Guid HighlightId);

public record UpdateHighlightRequest(
    string? Color,
    string? AnchorJson,
    string? SelectedText,
    string? NoteText,
    int? Version,
    bool RemoveNote = false,
    bool? IsPublic = null
);

public record PublishHighlightRequest(bool IsPublic);

public record ReportHighlightRequest(string Reason, string? Note = null);
