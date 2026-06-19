using System.Text;
using System.Text.RegularExpressions;
using TextStack.Ai.Rag;

namespace Application.Ai;

/// <summary>
/// The "Ask this book" prompt (Phase 4 RAG, AI-025), extracted so the eval harness exercises the
/// SAME prompt production serves. Pure string building, no dependencies. The spoiler gate is
/// enforced in SQL (AI-024) — the prompt does not need to mention it.
/// </summary>
public static class RagAskPrompt
{
    public static string BuildSystemPrompt() =>
        "You are a warm, thoughtful reading companion chatting with a reader about a book they are " +
        "reading. Be friendly and conversational in tone. " +
        "GROUNDING (strict, overrides everything below): the numbered excerpts below are your ONLY source " +
        "of truth about this book. Every substantive statement you make about the book — its plot, " +
        "characters, events, the author's words, AND any theme, symbolism, meaning, motive, or " +
        "interpretation you offer — MUST be supported by those excerpts, and you MUST cite each such claim " +
        "with [n] referring to the excerpt number(s) you used. Never use outside knowledge (the wider " +
        "story, other works, the author's biography, plot you recall) to assert, explain, or interpret " +
        "anything about this book, and never invent details that aren't in the excerpts. You may help the " +
        "reader reflect, but only by reasoning from what the cited excerpts actually say — if a thought " +
        "isn't supported there, don't present it as fact about the book. " +
        "The ONLY messages you may answer without citing excerpts are a greeting or a question about what " +
        "you can do (e.g. \"hi\", \"what can you do\"): respond warmly and invite a question about the book " +
        "— do NOT cite anything and do NOT say the excerpts lack the answer. For anything else, if the " +
        "excerpts don't cover it, say so gracefully (e.g. \"I don't see that in what you've read so far\") " +
        "rather than guessing or filling the gap from memory. " +
        "Keep replies short (a few sentences). No markdown, no preface.";

    /// <summary>
    /// The grounding context block: numbered excerpts (1-based, matching the citation markers) + the
    /// reader's own notes. <paramref name="chunks"/> order defines the [n] numbering. The question is
    /// NOT included — in the multi-turn assembly it's the final user message (see
    /// <see cref="RagAskHistory.BuildMessages"/>).
    /// </summary>
    public static string BuildContextBlock(IReadOnlyList<RetrievedChunk> chunks, IReadOnlyList<string> notes)
    {
        var sb = new StringBuilder();
        sb.Append("Numbered excerpts from the part of the book the reader has reached " +
                  "(cite these as [n] for any book fact):\n");
        for (var i = 0; i < chunks.Count; i++)
            sb.Append('[').Append(i + 1).Append("] (ch.").Append(chunks[i].ChapterOrd).Append(") ")
              .Append(chunks[i].Text).Append('\n');

        if (notes.Count > 0)
        {
            sb.Append("\nThe reader's own notes:\n");
            foreach (var note in notes)
                sb.Append("- ").Append(note).Append('\n');
        }

        return sb.ToString();
    }

    private static readonly Regex CitationMarker = new(@"\[(\d+)\]", RegexOptions.Compiled);

    /// <summary>
    /// Distinct, in-range, 1-based citation markers found in the answer (order of first appearance).
    /// Out-of-range / non-numeric markers are ignored.
    /// </summary>
    public static IReadOnlyList<int> ParseCitations(string answer, int excerptCount)
    {
        var seen = new HashSet<int>();
        var result = new List<int>();
        foreach (Match m in CitationMarker.Matches(answer))
        {
            if (int.TryParse(m.Groups[1].Value, out var n) && n >= 1 && n <= excerptCount && seen.Add(n))
                result.Add(n);
        }
        return result;
    }
}
