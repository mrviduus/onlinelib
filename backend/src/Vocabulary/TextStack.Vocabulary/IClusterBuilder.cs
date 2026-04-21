namespace TextStack.Vocabulary;

public record ClusterCandidate(
    string Title,
    string? Theme,
    double CohesionScore,
    IReadOnlyList<Guid> MemberWordIds);

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
}
