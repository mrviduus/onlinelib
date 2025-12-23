namespace Api.Language;

/// <summary>
/// Holds resolved language for current request.
/// </summary>
public record LanguageContext(
    string Language,
    LanguageSource Source
);

public enum LanguageSource
{
    UrlPath,
    AcceptLanguage,
    SiteDefault
}
