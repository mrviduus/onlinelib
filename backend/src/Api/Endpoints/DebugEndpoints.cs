using Api.Sites;

namespace Api.Endpoints;

public static class DebugEndpoints
{
    public static void MapDebugEndpoints(this IEndpointRouteBuilder app, IWebHostEnvironment env)
    {
        // Only expose debug endpoints in Development/Test
        if (!env.IsDevelopment() && !env.IsEnvironment("Test"))
            return;

        var group = app.MapGroup("/debug").WithTags("Debug");

        group.MapGet("/site", (IHostSiteContext siteContext) =>
            Results.Ok(new { site = siteContext.SiteKey }));
    }
}
