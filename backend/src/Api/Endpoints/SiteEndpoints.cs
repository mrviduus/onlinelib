using Api.Sites;

namespace Api.Endpoints;

public static class SiteEndpoints
{
    public static void MapSiteEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/site").WithTags("Site");

        group.MapGet("/context", GetSiteContext).WithName("GetSiteContext");
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
}
