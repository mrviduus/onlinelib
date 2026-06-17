namespace Contracts.Books;

/// <summary>
/// A book-card for the "Similar books" rail (AI-055). Mirrors <see cref="RelatedBookDto"/>'s
/// minimal shape (authors omitted in v1) but adds <c>Score</c> = cosine similarity
/// (1 - cosine distance, higher = closer) for AI-056 ordering + manual eval.
/// </summary>
public record SimilarBookDto(
    string Slug,
    string Title,
    string Language,
    string? CoverPath,
    double Score
);
