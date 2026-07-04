using Api.Sites;
using Application.Common.Interfaces;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class SsgEndpoints
{
    public static void MapSsgEndpoints(this WebApplication app)
    {
        var ssg = app.MapGroup("/ssg").WithTags("SSG");

        ssg.MapGet("/routes", GetAllRoutes).WithName("GetSsgRoutes");
        ssg.MapGet("/books", GetBooks).WithName("GetSsgBooks");
        ssg.MapGet("/authors", GetAuthors).WithName("GetSsgAuthors");
        ssg.MapGet("/genres", GetGenres).WithName("GetSsgGenres");
    }

    /// <summary>
    /// Returns all routes that need to be pre-rendered for SSG.
    /// Used by the prerender build script.
    /// </summary>
    private static async Task<IResult> GetAllRoutes(
        HttpContext httpContext,
        IAppDbContext db,
        CancellationToken ct)
    {
        var site = httpContext.GetSiteContext();
        var languages = new[] { "en" };

        var routes = new List<string>();

        // Static pages
        foreach (var lang in languages)
        {
            routes.Add($"/{lang}/");
            routes.Add($"/{lang}/books");
            routes.Add($"/{lang}/authors");
            routes.Add($"/{lang}/genres");
            routes.Add($"/{lang}/about");
        }

        // Books (each book has a language). Indexable is NOT a precondition:
        // copyright-grey editions (e.g. Camus's The Plague) still need a
        // rendered HTML for direct visitors. BookDetailPage reads the same
        // `indexable` flag from the API and emits <meta name="robots"
        // content="noindex,follow"> at render time. Filtering Indexable here
        // would leave nginx serving a hard 404 — see the matching change
        // in SsgRouteProvider.AddBookRoutesAsync.
        var books = await db.Editions
            .Where(e => e.Status == EditionStatus.Published &&
                        e.Chapters.Any())
            .Select(e => new { e.Slug, e.Language })
            .ToListAsync(ct);

        foreach (var book in books)
        {
            routes.Add($"/{book.Language}/books/{book.Slug}");
        }

        // Authors (use default language).
        //
        // `a.Indexable` is a MANUAL HIDE OVERRIDE — admin can flip it to false
        // to keep an author out of SSG + sitemap. Default for new authors is
        // `true` (Domain.Entities.Author). Be aware: migration
        // 20251225233053_AddAuthorsGenresSeoFields created the column WITHOUT
        // `defaultValue: true`, so all pre-existing authors got `false` in DB.
        // 656 rows had to be backfilled in 2026-05-19 (the day book→author 404s
        // blew up GSC index). If you add a migration that raw-INSERTs authors,
        // explicitly set `indexable = true` or you'll re-poison the pool.
        //
        // Primary signal is "has at least one Published+Indexable edition" —
        // that's why orphan-author-from-non-indexable-book is impossible.
        var authors = await db.Authors
            .Where(a => a.Indexable)
            .Where(a => a.EditionAuthors.Any(ea =>
                ea.Edition.Status == EditionStatus.Published &&
                ea.Edition.Indexable))
            .Select(a => a.Slug)
            .ToListAsync(ct);

        foreach (var slug in authors)
        {
            routes.Add($"/{site.DefaultLanguage}/authors/{slug}");
        }

        // Genres (use default language)
        var genres = await db.Genres
            .Where(g => g.Indexable)
            .Where(g => g.Editions.Any(e =>
                e.Status == EditionStatus.Published &&
                e.Indexable))
            .Select(g => g.Slug)
            .ToListAsync(ct);

        foreach (var slug in genres)
        {
            routes.Add($"/{site.DefaultLanguage}/genres/{slug}");
        }

        return Results.Ok(new { routes, count = routes.Count });
    }

    private static async Task<IResult> GetBooks(
        HttpContext httpContext,
        IAppDbContext db,
        CancellationToken ct)
    {
        var site = httpContext.GetSiteContext();

        var books = await db.Editions
            .Where(e => e.Status == EditionStatus.Published &&
                        e.Indexable &&
                        e.Chapters.Any())
            .OrderBy(e => e.Title)
            .Select(e => new { e.Slug, e.Language })
            .ToListAsync(ct);

        return Results.Ok(books);
    }

    private static async Task<IResult> GetAuthors(
        HttpContext httpContext,
        IAppDbContext db,
        CancellationToken ct)
    {
        var site = httpContext.GetSiteContext();

        var authors = await db.Authors
            .Where(a => a.Indexable)
            .Where(a => a.EditionAuthors.Any(ea =>
                ea.Edition.Status == EditionStatus.Published &&
                ea.Edition.Indexable))
            .OrderBy(a => a.Name)
            .Select(a => new { a.Slug })
            .ToListAsync(ct);

        return Results.Ok(authors);
    }

    private static async Task<IResult> GetGenres(
        HttpContext httpContext,
        IAppDbContext db,
        CancellationToken ct)
    {
        var site = httpContext.GetSiteContext();

        var genres = await db.Genres
            .Where(g => g.Indexable)
            .Where(g => g.Editions.Any(e =>
                e.Status == EditionStatus.Published &&
                e.Indexable))
            .OrderBy(g => g.Name)
            .Select(g => new { g.Slug })
            .ToListAsync(ct);

        return Results.Ok(genres);
    }
}
