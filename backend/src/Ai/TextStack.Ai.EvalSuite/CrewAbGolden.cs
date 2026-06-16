namespace TextStack.Ai.EvalSuite;

/// <summary>
/// One A/B golden case (AI-046): a piece of raw book source material that BOTH the single-call baseline
/// (<c>crew.baseline</c>) and the full <see cref="Application.Agents.FieldCrew"/> write the same field from.
/// The (<see cref="EntityType"/>, <see cref="FieldName"/>) pair resolves the shared <c>ContentBrief</c> via
/// <c>SeoBriefs.For</c>, so both arms enforce the identical contract — the eval isolates ORCHESTRATION, not
/// the rubric. v1 is edition/description only (N=10, TODO grow to 50).
/// </summary>
/// <param name="Id">Stable case id for the admin UI / test diagnostics.</param>
/// <param name="EntityType">The brief's entity (v1: <c>edition</c>).</param>
/// <param name="FieldName">The brief's field (v1: <c>description</c>).</param>
/// <param name="TargetLanguage">The output language passed to <c>SeoBriefs.For</c> (v1: <c>en</c>).</param>
/// <param name="SourceMaterial">Title + author + excerpt-style facts both arms ground their prose in.</param>
public record CrewAbGolden(
    string Id,
    string EntityType,
    string FieldName,
    string TargetLanguage,
    string SourceMaterial);

/// <summary>Loads the embedded A/B golden set (<c>crew_ab.json</c>).</summary>
public static class CrewAbGoldenSet
{
    public static IReadOnlyList<CrewAbGolden> Load() =>
        GoldenLoader.Load<CrewAbGolden>("crew_ab.json");
}
