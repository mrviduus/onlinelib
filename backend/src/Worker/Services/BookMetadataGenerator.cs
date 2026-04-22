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
        var (systemPrompt, userPrompt) = BuildPrompt(title, author, needsDescription);

        var llm = _llmFactory.Get("BookMetadata");
        var text = await llm.CompleteAsync(systemPrompt, userPrompt, maxOutputTokens: 400, ct);

        if (string.IsNullOrWhiteSpace(text))
            return null;

        return ParseResponse(text, needsDescription);
    }

    private static (string System, string User) BuildPrompt(string title, string? author, bool needsDescription)
    {
        var system = "You are a librarian. Given a book's title and author, provide metadata " +
                     "in the EXACT format requested. No preface, no markdown.";

        var parts = new List<string> { $"Book title: \"{title}\"" };

        if (!string.IsNullOrWhiteSpace(author))
            parts.Add($"Author: \"{author}\"");

        parts.Add("");
        parts.Add("Reply in this EXACT format (no other text):");
        parts.Add("GENRE: <one of: Fiction, Non-Fiction, Science Fiction, Fantasy, Mystery, Romance, Thriller, Horror, Biography, History, Science, Philosophy, Self-Help, Poetry, Drama, Children, Other>");
        parts.Add("YEAR: <approximate first publication year as 4-digit number, or UNKNOWN>");

        if (needsDescription)
            parts.Add("DESCRIPTION: <2-3 sentence book description, no spoilers>");

        return (system, string.Join("\n", parts));
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
}

public record BookMetadataResult(string? Genre, int? PublishedYear, string? Description);
