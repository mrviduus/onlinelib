namespace Api.Sites;

public static class HttpContextExtensions
{
    public static SiteContext GetSiteContext(this HttpContext context)
    {
        return context.Items["SiteContext"] as SiteContext
            ?? throw new InvalidOperationException("SiteContext not available. Ensure SiteContextMiddleware is registered.");
    }

    public static Guid GetSiteId(this HttpContext context)
    {
        return context.GetSiteContext().SiteId;
    }
}
