using Api.Sites;

namespace Api.Language;

/// <summary>
/// Extracts language from URL path prefix (/{lang}/...) and stores in HttpContext.Items.
/// Falls back to Accept-Language header, then Site.DefaultLanguage.
/// </summary>
public class LanguageMiddleware
{
    private readonly RequestDelegate _next;
    private static readonly HashSet<string> SupportedLanguages = new(StringComparer.OrdinalIgnoreCase) { "uk", "en" };
    private static readonly string[] SkipPaths = ["/admin", "/health", "/openapi", "/scalar", "/debug", "/site"];

    public LanguageMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? "";

        // Skip language resolution for admin/infra routes
        if (SkipPaths.Any(p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase)))
        {
            await _next(context);
            return;
        }

        var (lang, source, rewrittenPath) = ResolveLang(context, path);

        context.Items["LanguageContext"] = new LanguageContext(lang, source);

        // Rewrite path if language was extracted from URL
        if (rewrittenPath != null)
        {
            context.Request.Path = rewrittenPath;
        }

        await _next(context);
    }

    private static (string lang, LanguageSource source, string? rewrittenPath) ResolveLang(
        HttpContext context, string path)
    {
        // 1. Try URL path prefix: /{lang}/...
        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length > 0 && SupportedLanguages.Contains(segments[0]))
        {
            var lang = segments[0].ToLowerInvariant();
            var remaining = "/" + string.Join("/", segments.Skip(1));
            return (lang, LanguageSource.UrlPath, remaining);
        }

        // 2. Try Accept-Language header
        var acceptLang = context.Request.Headers.AcceptLanguage.FirstOrDefault();
        if (!string.IsNullOrEmpty(acceptLang))
        {
            var preferred = ParseAcceptLanguage(acceptLang);
            if (preferred != null && SupportedLanguages.Contains(preferred))
            {
                return (preferred.ToLowerInvariant(), LanguageSource.AcceptLanguage, null);
            }
        }

        // 3. Fall back to Site.DefaultLanguage
        var siteContext = context.Items["SiteContext"] as SiteContext;
        var defaultLang = siteContext?.DefaultLanguage ?? "uk";
        return (defaultLang, LanguageSource.SiteDefault, null);
    }

    private static string? ParseAcceptLanguage(string header)
    {
        // Parse "uk-UA,uk;q=0.9,en;q=0.8" → "uk"
        var parts = header.Split(',');
        foreach (var part in parts)
        {
            var langPart = part.Split(';')[0].Trim();
            var baseLang = langPart.Split('-')[0].ToLowerInvariant();
            if (SupportedLanguages.Contains(baseLang))
            {
                return baseLang;
            }
        }
        return null;
    }
}

public static class LanguageMiddlewareExtensions
{
    public static IApplicationBuilder UseLanguageContext(this IApplicationBuilder app)
    {
        return app.UseMiddleware<LanguageMiddleware>();
    }
}
