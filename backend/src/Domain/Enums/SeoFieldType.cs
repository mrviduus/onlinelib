namespace Domain.Enums;

/// <summary>
/// Which SEO field on the target entity a template generates.
/// Not every field is valid for every entity type — validation is at template creation time.
/// </summary>
public enum SeoFieldType
{
    Bio = 0,              // authors.bio
    Description = 1,      // editions.description, genres.description
    Relevance = 2,        // seo_relevance_text
    Themes = 3,           // seo_themes_json
    Faqs = 4,             // seo_faqs_json
    SeoTitle = 5,         // seo_title
    SeoDescription = 6    // seo_description
}
