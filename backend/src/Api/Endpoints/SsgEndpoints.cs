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
        var languages = new[] { "en", "uk" };

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

        // Country-targeted SEO landing pages (English-only — targeting EN-learners
        // in Brazil / Spain). Copy is English; country signals are in the
        // hero + FAQ + audience badge. No uk variants.
        routes.Add("/en/learn-english-brazil");
        routes.Add("/en/learn-english-spain");

        // Topic-targeted SEO landing pages (English-only).
        routes.Add("/en/read-books-in-english");
        routes.Add("/en/books-with-translation");

        // Books (each book has a language)
        var books = await db.Editions
            .Where(e => e.SiteId == site.SiteId &&
                        e.Status == EditionStatus.Published &&
                        e.Indexable &&
                        e.Chapters.Any())
            .Select(e => new { e.Slug, e.Language })
            .ToListAsync(ct);

        foreach (var book in books)
        {
            routes.Add($"/{book.Language}/books/{book.Slug}");
        }

        // Authors (use default language)
        var authors = await db.Authors
            .Where(a => a.SiteId == site.SiteId && a.Indexable)
            .Where(a => a.EditionAuthors.Any(ea =>
                ea.Edition.Status == EditionStatus.Published &&
                ea.Edition.Indexable))
            .Select(a => a.Slug)
            .ToListAsync(ct);

        foreach (var slug in authors)
        {
            routes.Add($"/{site.DefaultLanguage}/authors/{slug}");
        }

        // Blog posts (per-language)
        var blogPosts = await db.BlogPosts
            .Where(p => p.SiteId == site.SiteId && p.Status == BlogPostStatus.Published)
            .Select(p => new { p.Slug, p.Language })
            .ToListAsync(ct);

        foreach (var lang in languages)
        {
            routes.Add($"/{lang}/blog");
        }

        foreach (var post in blogPosts)
        {
            routes.Add($"/{post.Language}/blog/{post.Slug}");
        }

        // Genres (use default language)
        var genres = await db.Genres
            .Where(g => g.SiteId == site.SiteId && g.Indexable)
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
            .Where(e => e.SiteId == site.SiteId &&
                        e.Status == EditionStatus.Published &&
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
            .Where(a => a.SiteId == site.SiteId && a.Indexable)
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
            .Where(g => g.SiteId == site.SiteId && g.Indexable)
            .Where(g => g.Editions.Any(e =>
                e.Status == EditionStatus.Published &&
                e.Indexable))
            .OrderBy(g => g.Name)
            .Select(g => new { g.Slug })
            .ToListAsync(ct);

        return Results.Ok(genres);
    }
}
