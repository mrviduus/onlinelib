namespace Api.Sites;

/// <summary>
/// Middleware that resolves site from Host header and stores in IHostSiteContext.
/// See: docs/05-features/feat-0004-site-resolver-host.md
/// </summary>
public class HostSiteContextMiddleware
{
    private readonly RequestDelegate _next;

    public HostSiteContextMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, HostSiteResolver resolver, HostSiteContext siteContext, IWebHostEnvironment env)
    {
        var host = context.Request.Host.Host;
        var querySite = context.Request.Query["site"].FirstOrDefault();
        var isDev = env.IsDevelopment() || env.IsEnvironment("Test");

        siteContext.SiteKey = resolver.Resolve(host, querySite, isDev);

        await _next(context);
    }
}

public static class HostSiteContextMiddlewareExtensions
{
    public static IApplicationBuilder UseHostSiteContext(this IApplicationBuilder app)
    {
        return app.UseMiddleware<HostSiteContextMiddleware>();
    }
}
