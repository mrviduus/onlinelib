using Application.Ai;
using Domain.LLM;

namespace Worker.Services;

public class BookMetadataGenerator : IBookMetadataGenerator
{
    private readonly ILlmServiceFactory _llmFactory;

    public BookMetadataGenerator(ILlmServiceFactory llmFactory)
    {
        _llmFactory = llmFactory;
    }

    public async Task<BookMetadataResult?> GenerateAsync(
        string title, string? author, bool needsDescription, CancellationToken ct)
    {
        var (systemPrompt, userPrompt) = BookMetadataPrompt.Build(title, author, needsDescription);

        var llm = _llmFactory.Get("BookMetadata");
        var text = await llm.CompleteAsync(systemPrompt, userPrompt, maxOutputTokens: 400, ct);

        if (string.IsNullOrWhiteSpace(text))
            return null;

        return ParseResponse(text, needsDescription);
    }

    private static readonly HashSet<string> ValidGenres = new(StringComparer.OrdinalIgnoreCase)
    {
        "Fiction", "Non-Fiction", "Science Fiction", "Fantasy", "Mystery",
        "Romance", "Thriller", "Horror", "Biography", "History",
        "Science", "Philosophy", "Self-Help", "Poetry", "Drama", "Children", "Other"
    };

    private static BookMetadataResult? ParseResponse(string raw, bool needsDescription)
    {
        var lines = raw.Split('\n', StringSplitOptions.TrimEntries);
        string? genre = null;
        int? year = null;
        string? description = null;

        foreach (var line in lines)
        {
            if (line.StartsWith("GENRE:", StringComparison.OrdinalIgnoreCase))
            {
                var g = line["GENRE:".Length..].Trim();
                if (ValidGenres.Contains(g))
                    genre = g;
            }
            else if (line.StartsWith("YEAR:", StringComparison.OrdinalIgnoreCase))
            {
                var y = line["YEAR:".Length..].Trim();
                if (int.TryParse(y, out var parsed) && parsed > 0 && parsed <= DateTime.UtcNow.Year)
                    year = parsed;
            }
            else if (needsDescription && line.StartsWith("DESCRIPTION:", StringComparison.OrdinalIgnoreCase))
            {
                var d = line["DESCRIPTION:".Length..].Trim();
                if (d.Length > 10 && d.Length < 1000)
                    description = d;
            }
        }

        if (genre == null && year == null && description == null)
            return null;

        return new BookMetadataResult(genre, year, description);
    }
}

public interface IBookMetadataGenerator
{
    Task<BookMetadataResult?> GenerateAsync(
        string title, string? author, bool needsDescription, CancellationToken ct);

    /// <summary>
    /// Richer enrichment entry point (AI-Agent-1): same NULL-fields-only contract, but the caller may pass
    /// an opening excerpt and receives calibrated confidence + per-field provenance when the agent path is
    /// used. The default maps onto <see cref="GenerateAsync(string,string?,bool,CancellationToken)"/> so
    /// the legacy Ollama generator satisfies the interface without provenance.
    /// </summary>
    async Task<BookMetadataResult?> EnrichAsync(
        Guid bookId, string title, string? author, string? excerpt, bool needsDescription, CancellationToken ct) =>
        await GenerateAsync(title, author, needsDescription, ct);
}

/// <summary>
/// Result of book-metadata generation. <see cref="Confidence"/> and <see cref="ProvenanceJson"/> are
/// populated only by the enrichment-agent path (AI-Agent-1); the legacy Ollama generator leaves them null.
/// </summary>
public record BookMetadataResult(
    string? Genre,
    int? PublishedYear,
    string? Description,
    double? Confidence = null,
    string? ProvenanceJson = null);
