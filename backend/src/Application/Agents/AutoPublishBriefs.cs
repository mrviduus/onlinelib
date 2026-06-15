namespace Application.Agents;

/// <summary>
/// The hardcoded writing assignments for the in-process AutoPublish crew (Phase 7, AI-042). Mirrors the
/// "factual, encyclopedic tone; no subjective superlatives" rules the legacy <c>seo-generate.sh</c> hands
/// Claude, but as typed <see cref="ContentBrief"/>s the AI-041 specialists all read identically. Prose-only:
/// the crew owns just <c>Edition.Description</c> + <c>Edition.SeoRelevanceText</c>; themes/FAQs stay legacy.
///
/// Banned phrases and the style guide are constants for now (admin-editable later, AI-04x) — keep them in one
/// place so drafter, critic and editor enforce the exact same list. Bounds are in CHARACTERS.
/// </summary>
public static class AutoPublishBriefs
{
    private const string Entity = "edition";

    /// <summary>Description: 800-1600 chars (~150-250 words), the plot summary + literary significance block.</summary>
    public const int DescriptionMin = 800;
    public const int DescriptionMax = 1600;

    /// <summary>Relevance: 500-1000 chars (~100-150 words), modern connections + why readers today should care.</summary>
    public const int RelevanceMin = 500;
    public const int RelevanceMax = 1000;

    /// <summary>
    /// Subjective superlatives the SEO prose must avoid — encodes the legacy "no subjective superlatives" rule
    /// as an explicit list the critic can score against. The critic blocks a draft that uses any of these.
    /// </summary>
    public static readonly IReadOnlyList<string> BannedPhrases =
    [
        "masterpiece",
        "must-read",
        "timeless classic",
        "page-turner",
        "tour de force",
        "magnum opus",
    ];

    /// <summary>The shared tone contract — same string every specialist reads, so there is no style drift.</summary>
    public const string StyleGuide = "Factual, encyclopedic tone; no subjective superlatives; third person.";

    public static ContentBrief Description(string lang) =>
        new(Entity, "description", DescriptionMin, DescriptionMax, BannedPhrases, lang, StyleGuide);

    public static ContentBrief Relevance(string lang) =>
        new(Entity, "relevance", RelevanceMin, RelevanceMax, BannedPhrases, lang, StyleGuide);
}
