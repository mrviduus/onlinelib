namespace Application.Agents;

/// <summary>
/// The writing assignments for the in-process SEO crew (Phase 7, AI-043). Mirrors the "factual, encyclopedic,
/// third-person; no subjective superlatives" rules the legacy SEO backfill hands its LLM, but as typed
/// <see cref="ContentBrief"/>s every AI-041 specialist reads identically.
///
/// IMPORTANT: the <see cref="ContentBrief.StyleGuide"/> here is a SHORT distilled per-field constant — NOT the
/// raw <c>SeoTemplate.PromptTemplate</c>. The DB template carries <c>{{placeholders}}</c> and JSON-output
/// instructions meant for the legacy Claude-CLI path; feeding that to the prose specialists would corrupt their
/// plain-text output. The crew produces prose; the <see cref="SeoJobProcessor"/> apply path owns provenance,
/// trust and SSG. v1 scope is prose-only: <c>Edition.Description</c> + <c>Author.Bio</c>. Bounds are in CHARACTERS.
/// </summary>
public static class SeoBriefs
{
    /// <summary>Edition description: 800-1600 chars (~150-250 words), plot summary + literary significance.</summary>
    public const int EditionDescriptionMin = 800;
    public const int EditionDescriptionMax = 1600;

    /// <summary>Author bio: 600-1400 chars (~110-220 words), life + body of work + literary context.</summary>
    public const int AuthorBioMin = 600;
    public const int AuthorBioMax = 1400;

    private const string EditionDescriptionStyle =
        "Factual, encyclopedic, third-person prose. Summarize the book's plot and literary significance from the "
        + "supplied material only. No subjective superlatives, no marketing language, no second person.";

    private const string AuthorBioStyle =
        "Factual, encyclopedic, third-person prose. Summarize the author's life, body of work and literary "
        + "context from the supplied material only. No subjective superlatives, no marketing language, no second person.";

    /// <summary>
    /// Resolves the brief for the requested (entityType, fieldName). Keyed case-insensitively on the lowercased
    /// pair. v1 supports only edition/description and author/bio; anything else throws so the endpoint 400s.
    /// </summary>
    public static ContentBrief For(string entityType, string fieldName, string lang)
    {
        var key = (entityType.ToLowerInvariant(), fieldName.ToLowerInvariant());
        return key switch
        {
            ("edition", "description") => new ContentBrief(
                "edition", "description", EditionDescriptionMin, EditionDescriptionMax,
                CrewBannedPhrases.List, lang, EditionDescriptionStyle),
            ("author", "bio") => new ContentBrief(
                "author", "bio", AuthorBioMin, AuthorBioMax,
                CrewBannedPhrases.List, lang, AuthorBioStyle),
            _ => throw new ArgumentException(
                $"No SEO crew brief for ({entityType}, {fieldName}); v1 supports edition/description, author/bio."),
        };
    }
}
