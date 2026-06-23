using System.Text.Json.Serialization;

namespace Application.Agents;

/// <summary>A natural-language catalog request for the Librarian agent (AI-Agent-3), e.g.
/// "find books like 1984 about surveillance, in English, under 300 pages".</summary>
public record LibrarianInput(string Query);

/// <summary>
/// One ranked, reasoned recommendation. <see cref="Source"/> is its provenance —
/// <c>library</c> (in the user's TextStack catalog, has an <see cref="EditionId"/>/<see cref="Slug"/>) or
/// <c>open_library</c> (an external suggestion NOT yet in the library). <see cref="Why"/> is a one-line reason
/// grounded in the request. A <c>library</c> recommendation is only ever emitted when its edition id was
/// actually returned by a search tool during the run (anti-hallucination — see <see cref="LibrarianAgent"/>).
/// </summary>
public record LibrarianRecommendation(
    string Source,
    Guid? EditionId,
    string? Slug,
    string Title,
    IReadOnlyList<string> Authors,
    string Why,
    string? Language,
    int? Year,
    int? Pages)
{
    public const string SourceLibrary = "library";
    public const string SourceOpenLibrary = "open_library";
}

/// <summary>
/// The Librarian agent's structured answer: the ranked <see cref="Recommendations"/>, a short overall
/// <see cref="Reasoning"/>, and <see cref="UsedExternal"/> — whether the agent had to expand to Open Library
/// because the in-library coverage was thin. Maps directly to the endpoint response DTO.
/// </summary>
public record LibrarianAnswer(
    IReadOnlyList<LibrarianRecommendation> Recommendations,
    string Reasoning,
    bool UsedExternal)
{
    public static LibrarianAnswer Empty(string reasoning) => new([], reasoning, false);
}

/// <summary>
/// The JSON contract the agent's final message must emit (parsed by <see cref="LibrarianAgent.Parse"/>).
/// Lenient: unknown/missing fields collapse to null; any <c>library</c> recommendation whose <see cref="EditionId"/>
/// wasn't actually retrieved is DROPPED (never invented).
/// </summary>
public record LibrarianJson(
    [property: JsonPropertyName("recommendations")] List<LibrarianRecJson>? Recommendations,
    [property: JsonPropertyName("reasoning")] string? Reasoning,
    [property: JsonPropertyName("usedExternal")] bool UsedExternal);

/// <summary>One recommendation entry inside the agent's final JSON.</summary>
public record LibrarianRecJson(
    [property: JsonPropertyName("source")] string? Source,
    [property: JsonPropertyName("editionId")] string? EditionId,
    [property: JsonPropertyName("slug")] string? Slug,
    [property: JsonPropertyName("title")] string? Title,
    [property: JsonPropertyName("authors")] List<string>? Authors,
    [property: JsonPropertyName("why")] string? Why,
    [property: JsonPropertyName("language")] string? Language,
    [property: JsonPropertyName("year")] int? Year,
    [property: JsonPropertyName("pages")] int? Pages);
