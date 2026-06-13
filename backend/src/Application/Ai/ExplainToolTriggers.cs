using System.Text.RegularExpressions;

namespace Application.Ai;

/// <summary>
/// Deterministic pre-router for Explain's tools (AI-033). The eval showed gpt-4.1-nano can't hold
/// both directions of the tool decision at once (prompt iterations swung 0.33 → 0.50 → 0.73 → 0.53,
/// always sacrificing one side): so the LEXICAL part of the decision — does the sentence even
/// contain a tool-worthy signal? — moves into code. No signal → the request carries no tool schemas
/// and the model physically cannot over-call; a signal → only the matching tool is offered and the
/// prompt's trigger guidance steers the (now near-trivial) choice. Pure; unit-tested over the golden
/// set. Compiled regexes, not [GeneratedRegex] (repo ARM64 SIGILL caveat).
/// </summary>
public static class ExplainToolTriggers
{
    // "Chapter 5", "chapter 11" — a numbered chapter reference.
    private static readonly Regex ChapterRef =
        new(@"\bchapters?\s+\d+\b", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    // "discussed/mentioned/covered/saw/introduced ... earlier/before/previously" (either order),
    // or "earlier in this book/chapter".
    private static readonly Regex EarlierRef = new(
        @"\b(discussed|mentioned|covered|saw|introduced|touched\s+on)\b[^.!?]*\b(earlier|before|previously)\b" +
        @"|\b(earlier|previously)\b[^.!?]*\b(discussed|mentioned|covered|saw|introduced)\b" +
        @"|\bearlier\s+in\s+this\s+(book|chapter)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    // "my highlights", "I highlighted/marked/saved", "my notes".
    private static readonly Regex HighlightsRef = new(
        @"\bmy\s+(saved\s+)?(highlights?|notes?)\b|\bI\s+(highlighted|marked|saved|noted)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    /// <summary>
    /// The tool names this sentence's wording justifies offering, in stable order. Empty when the
    /// sentence carries no tool-worthy signal — the common case, which then skips the tool round
    /// entirely. <paramref name="hasUser"/> gates the highlights tool (needs a signed-in user).
    /// </summary>
    public static IReadOnlyList<string> TriggeredTools(string sentence, bool hasUser)
    {
        var tools = new List<string>();
        if (ChapterRef.IsMatch(sentence))
            tools.Add("get_chapter");
        if (EarlierRef.IsMatch(sentence))
            tools.Add("search_book");
        if (hasUser && HighlightsRef.IsMatch(sentence))
            tools.Add("get_user_highlights");
        return tools;
    }
}
