namespace TextStack.Vocabulary;

public record ClusterCandidate(
    string Title,
    string? Theme,
    double CohesionScore,
    IReadOnlyList<Guid> MemberWordIds);

// AI-059: label-only output. Membership is decided by the caller (HDBSCAN for concept
// clusters), so this carries no scoring or member selection — just a human Title + slug Theme.
public record ClusterLabel(string Title, string? Theme);

public interface IClusterBuilder
{
    /// <summary>
    /// Asks the LLM whether the given words form a cohesive theme.
    /// Returns null if cohesion is below threshold or LLM is unavailable.
    /// </summary>
    Task<ClusterCandidate?> BuildAsync(
        IReadOnlyList<(Guid Id, string Word)> words,
        string? bookTitle,
        string nativeLanguage,
        CancellationToken ct);

    /// <summary>
    /// AI-059: labels an ALREADY-FORMED cluster of words (membership fixed by the caller).
    /// Unlike <see cref="BuildAsync"/> there is no cohesion gate or member selection — it only
    /// produces a Title/Theme in <paramref name="nativeLanguage"/>. Returns null if the LLM is
    /// unavailable or the response is unusable; the caller keeps its placeholder/fallback label.
    /// </summary>
    Task<ClusterLabel?> LabelAsync(
        IReadOnlyList<string> words,
        string nativeLanguage,
        CancellationToken ct);
}
