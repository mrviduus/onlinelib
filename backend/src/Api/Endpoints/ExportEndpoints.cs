using Api.Language;
using Api.Sites;
using Application.Export;

namespace Api.Endpoints;

public static class ExportEndpoints
{
    public static void MapExportEndpoints(this WebApplication app)
    {
        app.MapGet("/books/{slug}/export/epub", ExportBookEpub)
            .WithTags("Export")
            .WithName("ExportBookEpub");
    }

    private static async Task<IResult> ExportBookEpub(
        string slug,
        HttpContext httpContext,
        EpubExportService epubExport,
        CancellationToken ct)
    {
        var siteId = httpContext.GetSiteId();
        var language = httpContext.GetLanguage();

        var result = await epubExport.ExportEditionAsync(siteId, slug, language, ct);
        if (result is null)
            return Results.NotFound();

        var (stream, fileName) = result.Value;
        return Results.File(stream, "application/epub+zip", fileName);
    }
}
