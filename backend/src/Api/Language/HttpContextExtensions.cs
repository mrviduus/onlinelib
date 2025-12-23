namespace Api.Language;

public static class LanguageHttpContextExtensions
{
    public static LanguageContext GetLanguageContext(this HttpContext context)
    {
        return context.Items["LanguageContext"] as LanguageContext
            ?? throw new InvalidOperationException("LanguageContext not available. Ensure LanguageMiddleware is registered.");
    }

    public static string GetLanguage(this HttpContext context)
    {
        return context.GetLanguageContext().Language;
    }

    public static bool TryGetLanguage(this HttpContext context, out string language)
    {
        if (context.Items["LanguageContext"] is LanguageContext langCtx)
        {
            language = langCtx.Language;
            return true;
        }
        language = "uk";
        return false;
    }
}
