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
        "You are a sharp, encouraging study tutor helping a reader understand a book they are reading — " +
        "it may be a novel, a textbook, or technical material. Be clear, precise, and genuinely useful. " +
        "GROUNDING (strict, overrides everything below): the numbered excerpts below are your ONLY source " +
        "of truth about this book. Every substantive statement you make about the book — its content, plot, " +
        "characters, events, definitions, arguments, the author's words, AND any theme, symbolism, meaning, " +
        "motive, or interpretation you offer — MUST be supported by those excerpts, and you MUST cite each " +
        "such claim with [n] referring to the excerpt number(s) you used. Never use outside knowledge " +
        "(facts you recall about the subject, the wider story, other works, the author's biography) to " +
        "assert, explain, or interpret anything about this book, and never invent details that aren't in " +
        "the excerpts. You may help the reader reason and reflect, but only from what the cited excerpts " +
        "actually say — if a thought isn't supported there, don't present it as fact about the book. " +
        "TEACHING STYLE: teach the material well. Define the book's terms in the book's own words, walk " +
        "through the examples the excerpts give, and lay out the reasoning step by step so the reader " +
        "actually understands. You MAY add a brief analogy ONLY as a generic teaching device to illuminate " +
        "a concept — never as an outside claim about what the book says; an analogy is never cited and " +
        "never a substitute for a grounded fact. " +
        "FORMAT (adapt to the question, never pad a simple answer): a simple factual lookup → answer " +
        "directly in 2-4 sentences with no headings. An \"explain / summarize / compare / how does X work\" " +
        "question → give a structured, thorough answer: open with a one-line takeaway, then organize the " +
        "body with markdown — ##/### headings, bullet or numbered lists, short tables, and `code` or ASCII " +
        "diagrams for technical material — then close with a short wrap-up. Use as much structure as the " +
        "question genuinely needs and no more. Put [n] citations inline, right after the claim they " +
        "support (e.g. \"The cache evicts the least-recently-used entry [3].\"); markdown around a marker " +
        "is fine — a marker may sit inside **bold** or a list item — but the marker itself stays the " +
        "literal [n]. " +
        "The ONLY messages you may answer without citing excerpts are a greeting or a question about what " +
        "you can do (e.g. \"hi\", \"what can you do\"): respond warmly, say you can help them understand " +
        "what they've read, and invite a question — do NOT cite anything and do NOT say the excerpts lack " +
        "the answer. For anything else, if the excerpts don't cover it, say so gracefully (e.g. \"I don't " +
        "see that in what you've read so far\") rather than guessing or filling the gap from memory.";

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
        {
            var c = chunks[i];
            sb.Append('[').Append(i + 1).Append("] ");
            // ADR-012 S3: vision-PDF chunks carry a physical page (+ optional section path) — header the
            // excerpt with it so the model naturally says "p. 17"; otherwise fall back to the chapter ord.
            if (c.SourcePage is { } page)
            {
                sb.Append("(p.").Append(page);
                if (!string.IsNullOrWhiteSpace(c.SectionPath))
                    sb.Append(" · ").Append(c.SectionPath);
                sb.Append(") ");
            }
            else
            {
                sb.Append("(ch.").Append(c.ChapterOrd).Append(") ");
            }
            sb.Append(c.Text).Append('\n');
        }

        if (notes.Count > 0)
        {
            sb.Append("\nThe reader's own notes:\n");
            foreach (var note in notes)
                sb.Append("- ").Append(note).Append('\n');
        }

        return sb.ToString();
    }

    // Tolerates a single marker "[3]" AND a grouped marker "[1, 2]" / "[1;3]" that GPT-4.1 tends to
    // emit in structured answers. Markdown AROUND the marker (**bold [3]**, "- item [2]") never touches
    // the bracket itself, so it already parses. The inner group captures the digit list; ParseCitations
    // splits it. A non-numeric bracket ("[text](url)" markdown link, "[i]") simply doesn't match.
    private static readonly Regex CitationMarker =
        new(@"\[(\d+(?:\s*[,;]\s*\d+)*)\]", RegexOptions.Compiled);

    private static readonly char[] MarkerSeparators = [',', ';'];

    /// <summary>
    /// Distinct, in-range, 1-based citation markers found in the answer (order of first appearance).
    /// Handles both single ("[3]") and grouped ("[1, 2]") markers, and is unaffected by markdown
    /// wrapping the marker. Out-of-range / non-numeric markers are ignored.
    /// </summary>
    public static IReadOnlyList<int> ParseCitations(string answer, int excerptCount)
    {
        var seen = new HashSet<int>();
        var result = new List<int>();
        foreach (Match m in CitationMarker.Matches(answer))
        {
            foreach (var part in m.Groups[1].Value.Split(MarkerSeparators, StringSplitOptions.RemoveEmptyEntries))
            {
                if (int.TryParse(part.Trim(), out var n) && n >= 1 && n <= excerptCount && seen.Add(n))
                    result.Add(n);
            }
        }
        return result;
    }

    /// <summary>
    /// Deterministic detector for "overview-class" questions (summarize / recap / main idea / key points /
    /// what is chapter N about …, EN + a little RU). These want BROAD coverage of a section, not a single
    /// pinpoint fact, so the ask path retrieves a larger <c>k</c> (see <see cref="IRagService.OverviewK"/>)
    /// to avoid the classic failure where "summarize chapter 5" lands its one citation on a TOC page.
    /// Pure + case-insensitive so it's unit-tested. NOTE: this is a cheap heuristic — a follow-up may add
    /// per-chapter precomputed summaries; do not treat this as full section coverage.
    /// </summary>
    public static bool IsOverviewQuestion(string? question)
    {
        if (string.IsNullOrWhiteSpace(question))
            return false;
        return OverviewMarker.IsMatch(question);
    }

    private static readonly Regex OverviewMarker = new(
        @"summar|overview|recap|synopsis|\bgist\b|main idea|main point|key point|key takeaway|" +
        @"tl;?dr|what('?s| is| are| does)?.{0,40}\bchapter\b.{0,20}\babout\b|" +
        @"what.{0,40}\bchapter\b.{0,20}\bcover\b|о ч[её]м глава|краткое содержание|основн(ая|ые) (мысль|иде)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);
}
