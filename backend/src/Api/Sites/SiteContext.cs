namespace Api.Sites;

public record SiteContext(
    Guid SiteId,
    string SiteCode,
    string PrimaryDomain,
    string DefaultLanguage,
    string Theme,
    bool AdsEnabled,
    bool IndexingEnabled,
    bool SitemapEnabled,
    string FeaturesJson
);
