using Infrastructure.Data;
using Infrastructure.Enums;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class BooksEndpoints
{
    public static void MapBooksEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/books").WithTags("Books");

        group.MapGet("", GetBooks).WithName("GetBooks");
        group.MapGet("/{slug}", GetBook).WithName("GetBook");
        group.MapGet("/{slug}/chapters", GetChapters).WithName("GetChapters");
        group.MapGet("/{slug}/chapters/{chapterSlug}", GetChapter).WithName("GetChapter");
    }

    private static async Task<IResult> GetBooks(
        AppDbContext db,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        [FromQuery] string? language,
        CancellationToken ct)
    {
        var query = db.Editions
            .Where(e => e.Status == EditionStatus.Published)
            .AsQueryable();

        if (!string.IsNullOrEmpty(language))
            query = query.Where(e => e.Language == language);

        var total = await query.CountAsync(ct);

        var books = await query
            .OrderByDescending(e => e.PublishedAt ?? e.CreatedAt)
            .Skip(offset ?? 0)
            .Take(limit ?? 20)
            .Select(e => new
            {
                e.Id,
                e.Slug,
                e.Title,
                e.Language,
                e.AuthorsJson,
                e.Description,
                e.CoverPath,
                e.PublishedAt,
                ChapterCount = e.Chapters.Count
            })
            .ToListAsync(ct);

        return Results.Ok(new { total, books });
    }

    private static async Task<IResult> GetBook(
        string slug,
        AppDbContext db,
        CancellationToken ct)
    {
        var book = await db.Editions
            .Where(e => e.Slug == slug)
            .Select(e => new
            {
                e.Id,
                e.Slug,
                e.Title,
                e.Language,
                e.AuthorsJson,
                e.Description,
                e.CoverPath,
                e.PublishedAt,
                e.IsPublicDomain,
                e.Status,
                Work = new { e.Work.Id, e.Work.Slug },
                Chapters = e.Chapters
                    .OrderBy(c => c.ChapterNumber)
                    .Select(c => new
                    {
                        c.Id,
                        c.ChapterNumber,
                        c.Slug,
                        c.Title,
                        c.WordCount
                    })
                    .ToList(),
                OtherEditions = e.Work.Editions
                    .Where(oe => oe.Id != e.Id && oe.Status == EditionStatus.Published)
                    .Select(oe => new { oe.Id, oe.Slug, oe.Language, oe.Title })
                    .ToList()
            })
            .FirstOrDefaultAsync(ct);

        if (book is null)
            return Results.NotFound();

        // Allow access to draft/hidden only for admin (TODO: add auth check)
        if (book.Status != EditionStatus.Published)
            return Results.NotFound();

        return Results.Ok(book);
    }

    private static async Task<IResult> GetChapters(
        string slug,
        AppDbContext db,
        CancellationToken ct)
    {
        var edition = await db.Editions
            .Where(e => e.Slug == slug && e.Status == EditionStatus.Published)
            .Select(e => new { e.Id })
            .FirstOrDefaultAsync(ct);

        if (edition is null)
            return Results.NotFound();

        var chapters = await db.Chapters
            .Where(c => c.EditionId == edition.Id)
            .OrderBy(c => c.ChapterNumber)
            .Select(c => new
            {
                c.Id,
                c.ChapterNumber,
                c.Slug,
                c.Title,
                c.WordCount
            })
            .ToListAsync(ct);

        return Results.Ok(chapters);
    }

    private static async Task<IResult> GetChapter(
        string slug,
        string chapterSlug,
        AppDbContext db,
        CancellationToken ct)
    {
        var chapter = await db.Chapters
            .Where(c => c.Edition.Slug == slug && c.Slug == chapterSlug)
            .Select(c => new
            {
                c.Id,
                c.ChapterNumber,
                c.Slug,
                c.Title,
                c.Html,
                c.WordCount,
                Edition = new
                {
                    c.Edition.Id,
                    c.Edition.Slug,
                    c.Edition.Title,
                    c.Edition.Language,
                    c.Edition.Status
                },
                Prev = db.Chapters
                    .Where(p => p.EditionId == c.EditionId && p.ChapterNumber == c.ChapterNumber - 1)
                    .Select(p => new { p.Slug, p.Title })
                    .FirstOrDefault(),
                Next = db.Chapters
                    .Where(n => n.EditionId == c.EditionId && n.ChapterNumber == c.ChapterNumber + 1)
                    .Select(n => new { n.Slug, n.Title })
                    .FirstOrDefault()
            })
            .FirstOrDefaultAsync(ct);

        if (chapter is null)
            return Results.NotFound();

        if (chapter.Edition.Status != EditionStatus.Published)
            return Results.NotFound();

        return Results.Ok(chapter);
    }
}
