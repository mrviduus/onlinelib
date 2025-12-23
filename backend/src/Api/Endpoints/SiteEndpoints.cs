using Api.Language;
using Api.Sites;

namespace Api.Endpoints;

public static class SiteEndpoints
{
    public static void MapSiteEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/site").WithTags("Site");

        group.MapGet("/context", GetSiteContext).WithName("GetSiteContext");
        group.MapGet("/language", GetLanguageContext).WithName("GetLanguageContext");
    }

    private static IResult GetSiteContext(HttpContext httpContext)
    {
        var site = httpContext.GetSiteContext();

        return Results.Ok(new
        {
            site.SiteId,
            site.SiteCode,
            site.PrimaryDomain,
            site.DefaultLanguage,
            site.Theme,
            site.AdsEnabled,
            site.IndexingEnabled,
            site.SitemapEnabled,
            Features = System.Text.Json.JsonDocument.Parse(site.FeaturesJson).RootElement
        });
    }

    private static IResult GetLanguageContext(HttpContext httpContext)
    {
        if (!httpContext.TryGetLanguage(out var language))
        {
            var site = httpContext.GetSiteContext();
            language = site.DefaultLanguage;
        }

        return Results.Ok(new { language, supportedLanguages = new[] { "uk", "en" } });
    }
}
