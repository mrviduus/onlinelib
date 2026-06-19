using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class UserDataEndpoints
{
    public static void MapUserDataEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/me").WithTags("User Data");

        // Reading Progress
        group.MapGet("/progress", GetAllProgress).WithName("GetAllProgress");
        group.MapGet("/progress/{editionId:guid}", GetProgress).WithName("GetProgress");
        group.MapPut("/progress/{editionId:guid}", UpsertProgress).WithName("UpsertProgress");
        group.MapDelete("/progress/{editionId:guid}", DeleteProgress).WithName("DeleteProgress");

        // Bookmarks
        group.MapGet("/bookmarks", GetAllBookmarks).WithName("GetAllBookmarks");
        group.MapGet("/bookmarks/{editionId:guid}", GetBookmarks).WithName("GetBookmarks");
        group.MapPost("/bookmarks", CreateBookmark).WithName("CreateBookmark");
        group.MapDelete("/bookmarks/{id:guid}", DeleteBookmark).WithName("DeleteBookmark");

        // Library
        group.MapGet("/library", GetLibrary).WithName("GetLibrary");
        group.MapPost("/library/{editionId:guid}", AddToLibrary).WithName("AddToLibrary");
        group.MapDelete("/library/{editionId:guid}", RemoveFromLibrary).WithName("RemoveFromLibrary");
    }

    // Reading Progress Endpoints

    private static async Task<IResult> GetAllProgress(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var siteId = httpContext.GetSiteId();

        var query = db.ReadingProgresses
            .Where(p => p.UserId == userId.Value && p.SiteId == siteId)
            .OrderByDescending(p => p.UpdatedAt);

        var total = await query.CountAsync(ct);
        var items = await query
            .Skip(offset ?? 0)
            .Take(limit ?? 50)
            .Join(db.Chapters, p => p.ChapterId, c => c.Id, (p, c) => new { p, c })
            .Select(x => new ReadingProgressDto(
                x.p.EditionId,
                x.p.ChapterId,
                x.c.Slug,
                x.p.Locator,
                x.p.Percent,
                x.p.UpdatedAt
            ))
            .ToListAsync(ct);

        return Results.Ok(new { total, items });
    }

    private static async Task<IResult> GetProgress(
        Guid editionId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var siteId = httpContext.GetSiteId();

        var progress = await db.ReadingProgresses
            .Where(p => p.UserId == userId.Value && p.SiteId == siteId && p.EditionId == editionId)
            .Join(db.Chapters, p => p.ChapterId, c => c.Id, (p, c) => new { p, c })
            .Select(x => new ReadingProgressDto(
                x.p.EditionId,
                x.p.ChapterId,
                x.c.Slug,
                x.p.Locator,
                x.p.Percent,
                x.p.UpdatedAt
            ))
            .FirstOrDefaultAsync(ct);

        return progress is null ? Results.NotFound() : Results.Ok(progress);
    }

    private static async Task<IResult> UpsertProgress(
        Guid editionId,
        [FromBody] UpsertProgressRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var siteId = httpContext.GetSiteId();

        // Validate edition exists
        var edition = await db.Editions
            .Where(e => e.Id == editionId && e.SiteId == siteId)
            .FirstOrDefaultAsync(ct);

        if (edition == null) return Results.NotFound("Edition not found");

        // Validate chapter exists
        var chapter = await db.Chapters
            .Where(c => c.Id == request.ChapterId && c.EditionId == editionId)
            .FirstOrDefaultAsync(ct);

        if (chapter == null) return Results.NotFound("Chapter not found");

        var existing = await db.ReadingProgresses
            .Where(p => p.UserId == userId.Value && p.SiteId == siteId && p.EditionId == editionId)
            .FirstOrDefaultAsync(ct);

        if (existing != null)
        {
            // Update only if client timestamp is newer (conflict resolution)
            if (request.UpdatedAt.HasValue && request.UpdatedAt.Value <= existing.UpdatedAt)
            {
                // Get current chapter slug for response
                var existingChapter = await db.Chapters.FirstOrDefaultAsync(c => c.Id == existing.ChapterId, ct);
                return Results.Ok(new ReadingProgressDto(
                    existing.EditionId,
                    existing.ChapterId,
                    existingChapter?.Slug,
                    existing.Locator,
                    existing.Percent,
                    existing.UpdatedAt
                ));
            }

            existing.ChapterId = request.ChapterId;
            existing.Locator = request.Locator;
            existing.Percent = request.Percent;
            // High-water mark for the RAG spoiler gate — monotonic, never decreases. NULL means
            // "never recorded" (distinct from ordinal 0, a real 0-based first chapter), so the first
            // write seeds it rather than max-ing against an implied 0.
            existing.MaxChapterNumber = existing.MaxChapterNumber.HasValue
                ? Math.Max(existing.MaxChapterNumber.Value, chapter.ChapterNumber)
                : chapter.ChapterNumber;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }
        else
        {
            var progress = new ReadingProgress
            {
                Id = Guid.NewGuid(),
                UserId = userId.Value,
                SiteId = siteId,
                EditionId = editionId,
                ChapterId = request.ChapterId,
                Locator = request.Locator,
                Percent = request.Percent,
                MaxChapterNumber = chapter.ChapterNumber,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            db.ReadingProgresses.Add(progress);
            existing = progress;
        }

        await db.SaveChangesAsync(ct);

        return Results.Ok(new ReadingProgressDto(
            existing.EditionId,
            existing.ChapterId,
            chapter.Slug,
            existing.Locator,
            existing.Percent,
            existing.UpdatedAt
        ));
    }

    private static async Task<IResult> DeleteProgress(
        Guid editionId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var siteId = httpContext.GetSiteId();

        var progress = await db.ReadingProgresses
            .Where(p => p.UserId == userId.Value && p.SiteId == siteId && p.EditionId == editionId)
            .FirstOrDefaultAsync(ct);

        if (progress == null) return Results.NotFound();

        db.ReadingProgresses.Remove(progress);
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    // Bookmarks Endpoints

    private static async Task<IResult> GetAllBookmarks(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var siteId = httpContext.GetSiteId();

        var query = db.Bookmarks
            .Where(b => b.UserId == userId.Value && b.SiteId == siteId)
            .OrderByDescending(b => b.CreatedAt);

        var total = await query.CountAsync(ct);
        var items = await query
            .Skip(offset ?? 0)
            .Take(limit ?? 100)
            .Select(b => new BookmarkDto(
                b.Id,
                b.EditionId,
                b.ChapterId,
                b.Locator,
                b.Title,
                b.CreatedAt
            ))
            .ToListAsync(ct);

        return Results.Ok(new { total, items });
    }

    private static async Task<IResult> GetBookmarks(
        Guid editionId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var siteId = httpContext.GetSiteId();

        var bookmarks = await db.Bookmarks
            .Where(b => b.UserId == userId.Value && b.SiteId == siteId && b.EditionId == editionId)
            .OrderByDescending(b => b.CreatedAt)
            .Select(b => new BookmarkDto(
                b.Id,
                b.EditionId,
                b.ChapterId,
                b.Locator,
                b.Title,
                b.CreatedAt
            ))
            .ToListAsync(ct);

        return Results.Ok(bookmarks);
    }

    private static async Task<IResult> CreateBookmark(
        [FromBody] CreateBookmarkRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var siteId = httpContext.GetSiteId();

        // Validate edition exists
        var edition = await db.Editions
            .Where(e => e.Id == request.EditionId && e.SiteId == siteId)
            .FirstOrDefaultAsync(ct);

        if (edition == null) return Results.NotFound("Edition not found");

        // Validate chapter exists
        var chapter = await db.Chapters
            .Where(c => c.Id == request.ChapterId && c.EditionId == request.EditionId)
            .FirstOrDefaultAsync(ct);

        if (chapter == null) return Results.NotFound("Chapter not found");

        var bookmark = new Bookmark
        {
            Id = Guid.NewGuid(),
            UserId = userId.Value,
            SiteId = siteId,
            EditionId = request.EditionId,
            ChapterId = request.ChapterId,
            Locator = request.Locator,
            Title = request.Title,
            CreatedAt = DateTimeOffset.UtcNow
        };

        db.Bookmarks.Add(bookmark);
        await db.SaveChangesAsync(ct);

        return Results.Created($"/me/bookmarks/{bookmark.Id}", new BookmarkDto(
            bookmark.Id,
            bookmark.EditionId,
            bookmark.ChapterId,
            bookmark.Locator,
            bookmark.Title,
            bookmark.CreatedAt
        ));
    }

    private static async Task<IResult> DeleteBookmark(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var bookmark = await db.Bookmarks
            .Where(b => b.Id == id && b.UserId == userId.Value)
            .FirstOrDefaultAsync(ct);

        if (bookmark == null) return Results.NotFound();

        db.Bookmarks.Remove(bookmark);
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    // Library Endpoints

    private static async Task<IResult> GetLibrary(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var query = db.UserLibraries
            .Where(l => l.UserId == userId.Value)
            .OrderByDescending(l => l.CreatedAt);

        var total = await query.CountAsync(ct);
        var raw = await query
            .Skip(offset ?? 0)
            .Take(limit ?? 50)
            .Select(l => new
            {
                l.EditionId,
                l.Edition.Slug,
                l.Edition.Title,
                l.Edition.Language,
                l.Edition.CoverPath,
                l.CreatedAt,
                AuthorNames = l.Edition.EditionAuthors
                    .OrderBy(ea => ea.Order)
                    .Select(ea => ea.Author.Name)
                    .ToList()
            })
            .ToListAsync(ct);

        var items = raw.Select(r => new LibraryItemDto(
            r.EditionId,
            r.Slug,
            r.Title,
            r.Language,
            r.CoverPath,
            r.CreatedAt,
            r.AuthorNames.Count > 0 ? string.Join(", ", r.AuthorNames) : null
        )).ToList();

        return Results.Ok(new { total, items });
    }

    private static async Task<IResult> AddToLibrary(
        Guid editionId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        // Check if edition exists; project only what we need (avoids materialising
        // related authors as full entities — we only want their names).
        var editionInfo = await db.Editions
            .Where(e => e.Id == editionId)
            .Select(e => new
            {
                e.Slug,
                e.Title,
                e.Language,
                e.CoverPath,
                AuthorNames = e.EditionAuthors
                    .OrderBy(ea => ea.Order)
                    .Select(ea => ea.Author.Name)
                    .ToList()
            })
            .FirstOrDefaultAsync(ct);
        if (editionInfo == null) return Results.NotFound("Edition not found");

        var authorJoined = editionInfo.AuthorNames.Count > 0
            ? string.Join(", ", editionInfo.AuthorNames)
            : null;

        // Check if already in library
        var existing = await db.UserLibraries
            .FirstOrDefaultAsync(l => l.UserId == userId.Value && l.EditionId == editionId, ct);

        if (existing != null)
            return Results.Ok(new LibraryItemDto(
                existing.EditionId,
                editionInfo.Slug,
                editionInfo.Title,
                editionInfo.Language,
                editionInfo.CoverPath,
                existing.CreatedAt,
                authorJoined
            ));

        var libraryItem = new UserLibrary
        {
            Id = Guid.NewGuid(),
            UserId = userId.Value,
            EditionId = editionId,
            CreatedAt = DateTimeOffset.UtcNow
        };

        db.UserLibraries.Add(libraryItem);
        await db.SaveChangesAsync(ct);

        return Results.Created($"/me/library/{editionId}", new LibraryItemDto(
            libraryItem.EditionId,
            editionInfo.Slug,
            editionInfo.Title,
            editionInfo.Language,
            editionInfo.CoverPath,
            libraryItem.CreatedAt,
            authorJoined
        ));
    }

    private static async Task<IResult> RemoveFromLibrary(
        Guid editionId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var libraryItem = await db.UserLibraries
            .FirstOrDefaultAsync(l => l.UserId == userId.Value && l.EditionId == editionId, ct);

        if (libraryItem == null) return Results.NotFound();

        db.UserLibraries.Remove(libraryItem);
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

// DTOs
public record ReadingProgressDto(
    Guid EditionId,
    Guid ChapterId,
    string? ChapterSlug,
    string Locator,
    double? Percent,
    DateTimeOffset UpdatedAt
);

public record UpsertProgressRequest(
    Guid ChapterId,
    string Locator,
    double? Percent,
    DateTimeOffset? UpdatedAt
);

public record BookmarkDto(
    Guid Id,
    Guid EditionId,
    Guid ChapterId,
    string Locator,
    string? Title,
    DateTimeOffset CreatedAt
);

public record CreateBookmarkRequest(
    Guid EditionId,
    Guid ChapterId,
    string Locator,
    string? Title
);

public record LibraryItemDto(
    Guid EditionId,
    string Slug,
    string Title,
    string Language,
    string? CoverPath,
    DateTimeOffset CreatedAt,
    string? Author
);
