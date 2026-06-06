namespace Application.Ai;

/// <summary>
/// Prompt for the 2-voice podcast script (Phase 3). Two hosts — Aria (curious, asks)
/// and Guy (explains) — discuss a book grounded ONLY in its text. Output is a strict
/// JSON dialogue array consumed by ScriptBuilder. Pure string building, no deps.
/// </summary>
public static class PodcastPrompt
{
    public static (string System, string User) Build(string title, string? author, string language, string bookText)
    {
        var system =
            "You write a two-host audio podcast script discussing a book, in the style of NotebookLM. " +
            "The hosts are Aria (curious, asks questions and reacts) and Guy (knowledgeable, explains). " +
            "Ground EVERYTHING strictly in the provided book text — never invent facts, quotes, or details. " +
            $"Write natural, engaging spoken dialogue in {language}; 1-3 sentences per turn; alternate speakers; " +
            "open with a short hook and close with a brief wrap-up. " +
            "Return ONLY a strict JSON array, no markdown and no preface: " +
            "[{\"speaker\":\"Aria\"|\"Guy\",\"line\":\"...\"}].";

        var header = $"Book: \"{title}\"";
        if (!string.IsNullOrWhiteSpace(author))
            header += $"\nAuthor: {author}";

        var user =
            $"{header}\n\n" +
            "Write the podcast dialogue covering the book's key ideas and themes.\n\n" +
            $"Book text:\n{bookText}";

        return (system, user);
    }
}
