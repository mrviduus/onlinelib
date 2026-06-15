namespace Application.Agents.Prompts;

/// <summary>
/// The crew researcher's prompt (AI-041): condense the raw source material into neutral, grounded bullet
/// FACTS that a later drafter will write from. Drops anything not present in the source — the whole crew's
/// factual grounding starts here, so hallucinated "facts" at this stage poison every downstream step.
/// Pure string building, no dependencies (mirrors <c>ExplainPrompt</c>).
/// </summary>
public static class ResearcherPrompt
{
    public static string BuildSystemPrompt(ContentBrief brief) =>
        $"You are a research assistant preparing notes for writing the {brief.FieldName} of a {brief.EntityType}. " +
        "Read the source material and extract only the concrete, verifiable facts relevant to that field. " +
        "Write them as short neutral bullet points, one fact per line, prefixed with \"- \". " +
        "Use ONLY information present in the source material. " +
        "If a detail is not in the source, do not include it — never guess, infer, or add outside knowledge. " +
        "No prose, no headings, no preface, no commentary — just the bullet list of facts.";

    public static string BuildUserPrompt(string sourceMaterial) =>
        $"Source material:\n{sourceMaterial}";
}
