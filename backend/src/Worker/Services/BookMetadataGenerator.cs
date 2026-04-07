using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;

namespace Worker.Services;

public static class BookMetadataGenerator
{
    public static async Task<BookMetadataResult?> GenerateAsync(
        string title, string? author, bool needsDescription,
        IHttpClientFactory httpClientFactory, IConfiguration config,
        CancellationToken ct)
    {
        var baseUrl = config.GetValue<string>("Ollama:BaseUrl") ?? "http://localhost:11434";
        var model = config.GetValue<string>("Ollama:Model") ?? "qwen3:8b";
        var timeout = config.GetValue("Ollama:TimeoutSeconds", 30);

        var prompt = BuildPrompt(title, author, needsDescription);

        var client = httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(timeout);

        var request = new { model, prompt, stream = false };
        var response = await client.PostAsJsonAsync($"{baseUrl}/api/generate", request, ct);

        if (!response.IsSuccessStatusCode)
            return null;

        var result = await response.Content.ReadFromJsonAsync<OllamaResponse>(ct);
        if (string.IsNullOrWhiteSpace(result?.Response))
            return null;

        return ParseResponse(result.Response, needsDescription);
    }

    private static string BuildPrompt(string title, string? author, bool needsDescription)
    {
        var parts = new List<string>
        {
            "You are a librarian. Given a book's title and author, provide metadata.",
            "",
            $"Book title: \"{title}\""
        };

        if (!string.IsNullOrWhiteSpace(author))
            parts.Add($"Author: \"{author}\"");

        parts.Add("");
        parts.Add("Reply in this EXACT format (no other text):");
        parts.Add("GENRE: <one of: Fiction, Non-Fiction, Science Fiction, Fantasy, Mystery, Romance, Thriller, Horror, Biography, History, Science, Philosophy, Self-Help, Poetry, Drama, Children, Other>");
        parts.Add("YEAR: <approximate first publication year as 4-digit number, or UNKNOWN>");

        if (needsDescription)
            parts.Add("DESCRIPTION: <2-3 sentence book description, no spoilers>");

        return string.Join("\n", parts);
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

public record BookMetadataResult(string? Genre, int? PublishedYear, string? Description);

file class OllamaResponse
{
    public string Response { get; set; } = "";
}
