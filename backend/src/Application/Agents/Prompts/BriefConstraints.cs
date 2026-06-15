namespace Application.Agents.Prompts;

/// <summary>
/// Shared, single-source rendering of the brief's length + banned-phrase constraints so the drafter, critic
/// and editor read them IDENTICALLY (AI-041). If the drafter is told "120-300 characters" and the critic
/// scores length against a different phrasing, length critique drifts — so all three call through here.
/// </summary>
internal static class BriefConstraints
{
    public static string Length(ContentBrief brief) =>
        $"{brief.MinLength}-{brief.MaxLength} characters";

    /// <summary>Comma-separated banned phrases, or null when the brief bans none.</summary>
    public static string? BannedPhrases(ContentBrief brief) =>
        brief.BannedPhrases.Count == 0
            ? null
            : string.Join(", ", brief.BannedPhrases.Select(p => $"\"{p}\""));
}
