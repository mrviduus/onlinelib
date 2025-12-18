using Api.Sites;
using Application.Books;
using Microsoft.AspNetCore.Mvc;

namespace Api.Endpoints;

public static class BooksEndpoints
{
    public static void MapBooksEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/books").WithTags("Books");

        group.MapGet("", GetBooks).WithName("GetBooks");
        group.MapGet("/{slug}", GetBook).WithName("GetBook");
        group.MapGet("/{slug}/chapters/{chapterSlug}", GetChapter).WithName("GetChapter");
    }

    private static async Task<IResult> GetBooks(
        HttpContext httpContext,
        BookService bookService,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        [FromQuery] string? language,
        CancellationToken ct)
    {
        var siteId = httpContext.GetSiteId();
        var result = await bookService.GetBooksAsync(siteId, offset ?? 0, limit ?? 20, language, ct);
        return Results.Ok(result);
    }

    private static async Task<IResult> GetBook(
        string slug,
        HttpContext httpContext,
        BookService bookService,
        CancellationToken ct)
    {
        var siteId = httpContext.GetSiteId();
        var book = await bookService.GetBookAsync(siteId, slug, ct);
        return book is null ? Results.NotFound() : Results.Ok(book);
    }

    private static async Task<IResult> GetChapter(
        string slug,
        string chapterSlug,
        HttpContext httpContext,
        BookService bookService,
        CancellationToken ct)
    {
        var siteId = httpContext.GetSiteId();
        var chapter = await bookService.GetChapterAsync(siteId, slug, chapterSlug, ct);
        return chapter is null ? Results.NotFound() : Results.Ok(chapter);
    }
}
