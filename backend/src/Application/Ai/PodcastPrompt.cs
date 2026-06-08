using System.Text;

namespace Application.Ai;

/// <summary>
/// Prompt for the 2-voice book INTRO (Phase 3). Two hosts — Aria (curious, asks) and
/// Guy (explains) — introduce a book to a new listener and make them want to read it.
/// Anchored on the book's human-curated Description (+ a short opening excerpt) rather
/// than thousands of words of chapter text: cheaper, and it leans on what the model
/// already knows about well-known titles without licensing it to invent specifics.
/// Output is a strict JSON dialogue array consumed by ScriptBuilder.
/// </summary>
public static class PodcastPrompt
{
    public static (string System, string User) Build(string title, string? author, string language, string? description, string? excerpt)
    {
        var system =
            "You write a short two-host audio INTRO that introduces a book to a new listener, in the style of NotebookLM. " +
            "The hosts are Aria (curious, asks questions and reacts) and Guy (knowledgeable, explains). " +
            "Goal: make the listener want to read the book — cover what it's about, its core themes, and why it matters; keep it spoiler-light (do not give away the ending). " +
            "Anchor on the provided overview and excerpt. You may draw on well-established facts about a widely-known book, but NEVER invent plot points, quotes, characters, or specifics — if the book is unfamiliar, stay strictly with what's provided. " +
            $"Write natural, engaging spoken dialogue in {language}; 1-3 sentences per turn; alternate speakers; open with a hook and close with a brief, warm 'give it a read' wrap-up. " +
            "Return ONLY a strict JSON array, no markdown and no preface: " +
            "[{\"speaker\":\"Aria\"|\"Guy\",\"line\":\"...\"}].";

        var user = new StringBuilder();
        user.Append($"Book: \"{title}\"");
        if (!string.IsNullOrWhiteSpace(author))
            user.Append($"\nAuthor: {author}");
        if (!string.IsNullOrWhiteSpace(description))
            user.Append($"\n\nOverview:\n{description.Trim()}");
        if (!string.IsNullOrWhiteSpace(excerpt))
            user.Append($"\n\nOpening excerpt:\n{excerpt.Trim()}");
        user.Append("\n\nWrite the intro dialogue.");

        return (system, user.ToString());
    }
}
