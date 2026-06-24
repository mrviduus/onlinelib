namespace Contracts.Agents;

/// <summary>Request to run the Librarian agent (AI-Agent-3) on a natural-language catalog query.</summary>
public record LibrarianRequest(string Query);

/// <summary>
/// One ranked recommendation in the Librarian response. <see cref="Source"/> is <c>library</c> (in the user's
/// catalog — has <see cref="EditionId"/>/<see cref="Slug"/>) or <c>open_library</c> (an external suggestion not
/// yet in the library). <see cref="Why"/> is the one-line, request-grounded reason.
/// </summary>
public record LibrarianRecommendationDto(
    string Source,
    Guid? EditionId,
    string? Slug,
    string Title,
    IReadOnlyList<string> Authors,
    string Why,
    string? Language,
    int? Year,
    int? Pages);

/// <summary>
/// The Librarian agent's response: the ranked <see cref="Recommendations"/>, the overall <see cref="Reasoning"/>,
/// <see cref="UsedExternal"/> (did it expand to Open Library because the library was thin?) and the persisted
/// <see cref="RunId"/> for replay in the admin AI-quality UI.
/// </summary>
public record LibrarianResponse(
    IReadOnlyList<LibrarianRecommendationDto> Recommendations,
    string Reasoning,
    bool UsedExternal,
    Guid RunId);
