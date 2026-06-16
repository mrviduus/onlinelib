using TextStack.Ai.Core;

namespace Application.Agents;

/// <summary>
/// The in-process AutoPublish content crew (Phase 7, AI-042 — refactored in AI-043 to delegate to the shared
/// <see cref="FieldCrew"/> runner). Generates ONE SEO prose field for an Edition by running the AI-041
/// specialists (researcher → drafter → critic → editor) over <see cref="ILlmService"/>. The endpoint runs it
/// TWICE — once per field (Description, Relevance) — so each field gets its own 4-stage plan, its own cost cap
/// and its own persisted <c>agent_run</c> (agent <c>crew.autopublish</c>).
///
/// A thin wrapper: all the per-field machinery (the 4-stage plan, the fail-closed gate, agent_run persistence)
/// now lives in <see cref="FieldCrew"/>; this class pins the AutoPublish crew name, goal and cost cap and keeps
/// the <see cref="AutoPublishFieldResult"/> return shape + the static <see cref="NeedsReview"/> gate so the
/// AI-042 endpoint and its tests are unchanged.
/// </summary>
public sealed class AutoPublishCrew(FieldCrew fieldCrew)
{
    /// <summary>Per-field cost ceiling. 4 nano calls cost well under this; the cap is a hard runaway guard.</summary>
    public const decimal CostCapUsd = 0.02m;

    private const string CrewName = "autopublish";

    /// <summary>
    /// Generates a single Edition field. Delegates to the shared <see cref="FieldCrew"/> with the AutoPublish
    /// crew name (agent <c>crew.autopublish</c>), goal <c>edition.{field}</c> and the per-field cost cap, then
    /// maps the shared <see cref="FieldResult"/> onto <see cref="AutoPublishFieldResult"/> so callers/tests do
    /// not churn. Writes nothing to the Edition; the caller owns the apply/publish call.
    /// </summary>
    public async Task<AutoPublishFieldResult> RunFieldAsync(
        ContentBrief brief, string sourceMaterial, AgentContext ctx, CancellationToken ct)
    {
        var r = await fieldCrew.RunFieldAsync(
            CrewName, $"edition.{brief.FieldName}", CostCapUsd, brief, sourceMaterial, ctx, ct);
        return new AutoPublishFieldResult(r.EditedText, r.Critique, r.NeedsReview, r.Status, r.RunId);
    }

    /// <summary>
    /// The review gate (delegates to <see cref="FieldCrew.NeedsReview"/>). Kept as a static so AI-042's pure
    /// gate tests still call <c>AutoPublishCrew.NeedsReview</c>. Fail-closed semantics live in FieldCrew.
    /// </summary>
    public static bool NeedsReview(string crewStatus, CritiqueResult? critique, string? editedText, int minLength) =>
        FieldCrew.NeedsReview(crewStatus, critique, editedText, minLength);
}

/// <summary>
/// Outcome of one AutoPublish field run (AI-042). <see cref="EditedText"/> is the editor's final prose (null if
/// the crew never reached the edit stage). <see cref="Critique"/> is the critic's verdict (null on halt before
/// critique). <see cref="NeedsReview"/> is the fail-closed gate — true means "do not auto-apply". The DB write
/// and publish decision live in the caller, never here. Mirrors the shared <see cref="FieldResult"/> shape.
/// </summary>
public record AutoPublishFieldResult(
    string? EditedText,
    CritiqueResult? Critique,
    bool NeedsReview,
    string Status,
    Guid RunId);
