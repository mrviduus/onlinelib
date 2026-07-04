using Api.Extensions;
using Api.Mapping;
using Api.Sites;
using Application.Auth;
using Application.Common.Interfaces;
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


        var highlights = await db.Highlights
            .Where(h => h.UserId == userId.Value && h.EditionId == editionId)
            .OrderByDescending(h => h.CreatedAt)
            .Select(HighlightMappings.Project)
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


        var owns = await db.UserBooks.AnyAsync(b => b.Id == userBookId && b.UserId == userId.Value, ct);
        if (!owns) return Results.NotFound();

        var highlights = await db.Highlights
            .Where(h => h.UserId == userId.Value && h.UserBookId == userBookId)
            .OrderByDescending(h => h.CreatedAt)
            .Select(HighlightMappings.Project)
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

        limit = Math.Clamp(limit, 1, 100);

        var query = db.Highlights
            .Where(h => h.UserId == userId.Value);

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
                h.UserChapterId != null ? h.UserChapter!.Slug : null
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

        limit = Math.Clamp(limit, 1, 30);

        var cutoff = DateTimeOffset.UtcNow.AddHours(-24);

        var highlights = await db.Highlights
            .Where(h => h.UserId == userId.Value && (h.LastReviewedAt == null || h.LastReviewedAt < cutoff))
            .OrderBy(h => h.LastReviewedAt ?? DateTimeOffset.MinValue)
            .ThenBy(h => h.CreatedAt)
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

        if (isUserBook == isEdition)
            return Results.BadRequest("Provide either EditionId+ChapterId or UserBookId+UserChapterId");

        if (isEdition)
        {
            if (!request.ChapterId.HasValue)
                return Results.BadRequest("ChapterId required for edition highlights");

            var editionId = request.EditionId!.Value;
            var chapterId = request.ChapterId!.Value;
            var edition = await db.Editions
                .Where(e => e.Id == editionId)
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
        };

        db.Highlights.Add(highlight);
        await db.SaveChangesAsync(ct);

        return Results.Created($"/me/highlights/{highlight.Id}", highlight.ToDto());
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

        if (request.Version.HasValue && request.Version.Value != highlight.Version)
            return Results.Conflict(highlight.ToDto());

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

        highlight.Version++;
        highlight.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        return Results.Ok(highlight.ToDto());
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
    DateTimeOffset UpdatedAt
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
    string? UserChapterSlug
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
    Guid? UserChapterId = null
);

public record MarkReviewedRequest(Guid HighlightId);

public record UpdateHighlightRequest(
    string? Color,
    string? AnchorJson,
    string? SelectedText,
    string? NoteText,
    int? Version,
    bool RemoveNote = false
);
