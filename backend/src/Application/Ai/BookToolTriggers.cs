using System.Text.RegularExpressions;

namespace Application.Ai;

/// <summary>
/// The lexical book-tool signals a passage can carry (AI-039). A self-contained passage matches
/// <see cref="None"/> — the common case — so the run offers no tools and the model physically cannot
/// over-call; a passage that genuinely references a numbered chapter, an earlier discussion, or the
/// reader's own highlights matches the corresponding flag(s), and only the matching tool(s) get offered.
/// </summary>
[Flags]
public enum BookToolSignal
{
    None = 0,
    ChapterNumber = 1,
    EarlierReference = 2,
    UserHighlights = 4,
}

/// <summary>
/// Shared deterministic detector for the book-tool lexical signals (AI-039). Generalizes the same
/// insight as the Explain pre-router (AI-033): gpt-4.1-nano can't hold both directions of the tool
/// decision at once, so the LEXICAL part of "does this passage even reference a tool-worthy signal?"
/// moves into code, while the model only decides the (now near-trivial) remainder. Pure; unit-tested
/// over the golden set. Compiled regexes, not [GeneratedRegex] (repo ARM64 SIGILL caveat).
/// </summary>
public static class BookToolTriggers
{
    // "Chapter 5", "chapter 11" — a numbered chapter reference.
    private static readonly Regex ChapterRef =
        new(@"\bchapters?\s+\d+\b", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    // A genuine "discussed-earlier-in-the-book" cross-reference — tightened (AI-039 QA P3) so the
    // discuss-verb and the temporal token are ADJACENT, not merely co-present in one sentence. The old
    // "[^.!?]*" between them false-positived on self-contained sentences where a high-frequency verb
    // happened to share a sentence with "earlier"/"previously" (e.g. "Earlier adopters … covered their
    // bets", "The earlier benchmark mentioned a slow node", "I covered the topic earlier today"), which
    // over-offered search_book / find_earlier_definition and nudged steps up. Three forms:
    //   1. verb → temporal, ≤3 words apart   ("discussed earlier", "touched on skew earlier")
    //   2. covered/saw → temporal, immediately adjacent only (these are the FP drivers loose, so they
    //      only count when directly anchored: "covered earlier")
    //   3. temporal → verb, but only across a pronoun ("earlier we discussed") — a noun phrase in
    //      between ("earlier adopters … covered", "earlier benchmark mentioned") is NOT a reference
    //   plus the explicit "earlier in this book/chapter" anchor.
    private static readonly Regex EarlierRef = new(
        @"\b(discussed|mentioned|introduced|touched\s+on)\b(?:\s+\w+){0,3}\s+(earlier|before|previously)\b" +
        @"|\b(covered|saw)\s+(earlier|before|previously)\b" +
        @"|\b(earlier|previously|before)\s+(?:we|i|they|he|she|you|it)\s+(discussed|mentioned|introduced|covered|saw|touched\s+on)\b" +
        @"|\bearlier\s+in\s+this\s+(book|chapter)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    // "my highlights", "I highlighted/marked/saved", "my notes".
    private static readonly Regex HighlightsRef = new(
        @"\bmy\s+(saved\s+)?(highlights?|notes?)\b|\bI\s+(highlighted|marked|saved|noted)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    /// <summary>
    /// ORs together every lexical signal the <paramref name="text"/> matches. Returns
    /// <see cref="BookToolSignal.None"/> when the text carries no tool-worthy wording.
    /// </summary>
    public static BookToolSignal Detect(string text)
    {
        var signal = BookToolSignal.None;
        if (ChapterRef.IsMatch(text))
            signal |= BookToolSignal.ChapterNumber;
        if (EarlierRef.IsMatch(text))
            signal |= BookToolSignal.EarlierReference;
        if (HighlightsRef.IsMatch(text))
            signal |= BookToolSignal.UserHighlights;
        return signal;
    }
}
