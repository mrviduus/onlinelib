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
        "You answer a reader's question about a book using ONLY the numbered excerpts provided. " +
        "Write 2-4 sentences. Cite every claim with [n] referring to the excerpt numbers you used. " +
        "If the excerpts do not contain the answer, say so plainly — do NOT use outside knowledge. " +
        "No preface, no markdown.";

    /// <summary>
    /// Numbered excerpts (1-based, matching the citation markers) + the reader's own notes, then the
    /// question. <paramref name="chunks"/> order defines the [n] numbering.
    /// </summary>
    public static string BuildUserPrompt(
        string question, IReadOnlyList<RetrievedChunk> chunks, IReadOnlyList<string> notes)
    {
        var sb = new StringBuilder();
        sb.Append("Excerpts:\n");
        for (var i = 0; i < chunks.Count; i++)
            sb.Append('[').Append(i + 1).Append("] (ch.").Append(chunks[i].ChapterOrd).Append(") ")
              .Append(chunks[i].Text).Append('\n');

        if (notes.Count > 0)
        {
            sb.Append("\nYour notes:\n");
            foreach (var note in notes)
                sb.Append("- ").Append(note).Append('\n');
        }

        sb.Append("\nQuestion: ").Append(question);
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
