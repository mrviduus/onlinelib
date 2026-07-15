namespace Application.Ai;

/// <summary>
/// Pure prompt + text helpers for precomputed per-chapter RAG summaries (the "S2" completeness upgrade):
/// each chapter gets one faithful, dense ~150-250 word digest, stored as an <c>is_summary</c> chunk so an
/// overview-class ask ("summarize chapter N") draws on a whole-chapter unit instead of scattered excerpts.
/// No dependencies — the LLM call itself lives in <c>Application.Rag.ChapterSummarizer</c>; this class only
/// builds the prompt, clamps the input, and renders the stored chunk text. Extracted so the clamp + the
/// stored-text prefix are unit-testable without an LLM.
/// </summary>
public static class ChapterSummaryPrompt
{
    /// <summary>
    /// Upper bound on chapter plain-text fed to the summarizer. The opening ~12k chars carry more than
    /// enough signal for a faithful digest of a chapter while bounding per-call cost (nano) and keeping
    /// every call well under the model's context window. Long chapters are summarized from their head.
    /// </summary>
    public const int MaxInputChars = 12_000;

    /// <summary>
    /// Per-book ceiling on chapters summarized in one indexing run. The whole pass is sequential nano
    /// calls inside the existing 12-min parse timeout; ≤ this many is comfortably safe. Books with more
    /// chapters get their first <see cref="MaxChaptersToSummarize"/> summarized (the caller logs).
    /// </summary>
    public const int MaxChaptersToSummarize = 60;

    /// <summary>Output cap: ~250 words ≈ 350 tokens; a little headroom so a dense summary never truncates.</summary>
    public const int MaxOutputTokens = 400;

    public static string BuildSystemPrompt() =>
        "You write a faithful, dense summary of ONE chapter of a book for a study tool. " +
        "The chapter may be from a novel, a textbook, or technical material. Cover its key concepts, " +
        "arguments, definitions, and events — the things a reader would need to recall what this chapter " +
        "is about — using only what the chapter text actually says. Do not invent, do not add outside " +
        "knowledge, and do not editorialize. Write 150-250 words of plain prose (no headings, no bullet " +
        "lists, no preamble like \"This chapter\" or \"In summary\"). Begin directly with the substance.";

    /// <summary>
    /// The user prompt: the chapter's clamped plain text. Pure. Empty/whitespace input yields empty
    /// (the caller skips a chapter with no text before ever calling the model).
    /// </summary>
    public static string BuildUserPrompt(string? plainText) => Clamp(plainText);

    /// <summary>First <see cref="MaxInputChars"/> characters of <paramref name="plainText"/> (trimmed). Pure.</summary>
    public static string Clamp(string? plainText)
    {
        if (string.IsNullOrWhiteSpace(plainText))
            return string.Empty;
        var text = plainText.Trim();
        return text.Length <= MaxInputChars ? text : text[..MaxInputChars];
    }

    /// <summary>
    /// The stored chunk text for a chapter summary: the marker line
    /// <c>"Summary of Chapter {n} — {title}:"</c> (the "— {title}" dropped when the title is blank) then
    /// the model's summary on the next line. The prefix makes the row lexically self-describing so the
    /// FTS branch matches "summarize chapter N" queries; it also reads well as a citation. Pure.
    /// </summary>
    public static string BuildSummaryChunkText(int chapterNumber, string? title, string summary)
    {
        var header = string.IsNullOrWhiteSpace(title)
            ? $"Summary of Chapter {chapterNumber}:"
            : $"Summary of Chapter {chapterNumber} — {title.Trim()}:";
        return $"{header}\n{summary.Trim()}";
    }
}
