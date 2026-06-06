namespace Application.Ai;

/// <summary>
/// The book-metadata prompt extracted from <see cref="BookMetadataGenerator"/> so
/// the eval harness exercises the SAME prompt production serves. Pure string
/// building, no dependencies.
/// </summary>
public static class BookMetadataPrompt
{
    public static (string System, string User) Build(string title, string? author, bool needsDescription)
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
}
