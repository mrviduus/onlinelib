using System.Text;

namespace Application.Ai;

/// <summary>
/// Prompt for the 2-voice book TRAILER (Phase 3). Two voices — Aria and Guy — co-narrate
/// a short, cinematic voiceover that sets the mood, raises the book's central question, and
/// builds intrigue toward a hook, then invites the listener to read it. Anchored on the book's
/// human-curated Description (+ a short opening excerpt) rather than thousands of words of
/// chapter text: cheaper, and it leans on what the model already knows about well-known titles
/// without licensing it to invent specifics. Output is a strict JSON dialogue array consumed
/// by ScriptBuilder.
/// </summary>
public static class PodcastPrompt
{
    public static (string System, string User) Build(string title, string? author, string language, string? description, string? excerpt)
    {
        var system =
            "You write a short, cinematic audio TRAILER for a book — a polished, professional voiceover like a film trailer, but for this title. " +
            "Two voices, Aria and Guy, co-narrate (they trade lines and build on each other) — this is a produced trailer, NOT a casual chat. " +
            "Make it lively and natural: short, punchy, vivid lines that set the mood, raise the central question the book explores, and build intrigue toward a strong hook — then end on a brief, confident invitation to read it. " +
            "Voice — concrete and atmospheric, varied rhythm, real energy without melodrama. " +
            "NEVER sound like a fake AI podcast: no 'wow', 'fascinating', 'amazing', 'incredible', 'exactly', 'great point'; no host-to-host validation, no small talk, no 'let's dive in', no recapping or over-explaining — evoke, don't lecture. " +
            "Keep it spoiler-light (never give away the ending). Anchor on the provided overview and excerpt; you may use well-established facts about a widely-known book, but NEVER invent plot points, quotes, characters, or specifics — if the book is unfamiliar, stay strictly with what's provided. " +
            $"Write in {language}; mostly 1, sometimes 2 sentences per turn; alternate speakers. " +
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
        user.Append("\n\nWrite the trailer.");

        return (system, user.ToString());
    }
}
