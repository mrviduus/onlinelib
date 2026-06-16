namespace TextStack.Ai.EvalSuite;

/// <summary>
/// One synthetic-defect golden case (AI-044). A KNOWN-clean draft + its research notes, plus a
/// <see cref="DefectType"/> describing the single defect <see cref="CriticDefectInjector"/> splices in
/// (deterministically, no LLM) before the real AI-041 critic scores it. The harness measures whether the
/// critic CATCHES each injected defect (catch-rate vs the ≥0.80 gate) and how often it flags a clean
/// control (false-positive rate). Defect types: <c>factual_hallucination</c>, <c>banned_phrase</c>,
/// <c>length_over</c>, <c>length_under</c>, <c>tone_break</c>, <c>clean</c> (no defect — a control).
/// </summary>
/// <param name="Id">Stable case id for the admin UI / test diagnostics.</param>
/// <param name="CleanDraft">A grounded, in-bounds, neutral-tone draft. The injector mutates a COPY.</param>
/// <param name="ResearchNotes">The facts the draft is grounded in — a hallucination is a fact NOT here.</param>
/// <param name="DefectType">Which transform the injector applies (or <c>clean</c> = none).</param>
/// <param name="ExpectedAxis">The critic axis that should fire (<c>null</c> for clean controls).</param>
/// <param name="InjectionParam">
/// The deterministic transform parameter: the fabricated sentence (factual_hallucination), the banned
/// phrase to splice (banned_phrase), the tone aside (tone_break). Unused for length_* / clean.
/// </param>
public record CriticDefectGolden(
    string Id,
    string CleanDraft,
    string ResearchNotes,
    string DefectType,
    string? ExpectedAxis,
    string? InjectionParam);

/// <summary>Loads the embedded synthetic-defect golden set (<c>criticdefects.json</c>).</summary>
public static class CriticDefectGoldenSet
{
    public static IReadOnlyList<CriticDefectGolden> Load() =>
        GoldenLoader.Load<CriticDefectGolden>("criticdefects.json");
}
