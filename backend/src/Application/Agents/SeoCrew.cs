using TextStack.Ai.Core;

namespace Application.Agents;

/// <summary>
/// The in-process SEO content crew (Phase 7, AI-043). A thin wrapper over the shared <see cref="FieldCrew"/>
/// runner that generates ONE SEO prose field (Edition.Description or Author.Bio) by running the AI-041
/// specialists over <see cref="ILlmService"/> — the observable, traced alternative to the legacy out-of-process
/// <c>seo-backfill-poll.sh</c> + Claude-CLI poller (which stays the default, untouched).
///
/// DB-free core: it never reads or writes an entity. The endpoint loads + sanitizes the source material and
/// routes the result through the existing <see cref="SeoJobProcessor"/> apply path so revert / trust / SSG keep
/// working. Persists each run as agent <c>crew.seo</c> with goal <c>{entityType}.{fieldName}</c>.
/// </summary>
public sealed class SeoCrew(FieldCrew fieldCrew)
{
    /// <summary>Per-field cost ceiling. 4 nano calls cost well under this; the cap is a hard runaway guard.</summary>
    public const decimal CostCapUsd = 0.02m;

    private const string CrewName = "seo";

    /// <summary>
    /// Generates a single SEO field. Delegates to <see cref="FieldCrew"/> with crew name <c>seo</c> (agent
    /// <c>crew.seo</c>), goal <c>{entityType}.{fieldName}</c> (from the brief) and the per-field cost cap. Writes
    /// nothing; the caller routes the edited text + review verdict through the SeoBackfillJob apply path.
    /// </summary>
    public Task<FieldResult> RunFieldAsync(
        ContentBrief brief, string sourceMaterial, AgentContext ctx, CancellationToken ct) =>
        fieldCrew.RunFieldAsync(
            CrewName, $"{brief.EntityType}.{brief.FieldName}", CostCapUsd, brief, sourceMaterial, ctx, ct);
}
