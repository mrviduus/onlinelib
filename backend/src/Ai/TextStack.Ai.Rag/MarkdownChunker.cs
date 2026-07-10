using System.Text;
using System.Text.RegularExpressions;
using Microsoft.ML.Tokenizers;

namespace TextStack.Ai.Rag;

/// <summary>
/// Structure-aware chunker for vision-parsed PDF Markdown (ADR-012 S3). Unlike the sentence-based
/// <see cref="Chunker"/> (used for reflowed EPUB prose), this preserves document structure:
/// <list type="bullet">
///   <item>splits on Markdown ATX headings (a heading starts a new chunk) and tracks a section-path
///   breadcrumb stack, stamping each chunk with the heading path it falls under;</item>
///   <item>NEVER splits a Markdown table mid-row — a header + <c>|---|</c> delimiter + body rows stay
///   in one chunk even if it exceeds <see cref="MaxTokens"/> (mirrors <see cref="Chunker"/>'s
///   "always take at least one" rule);</item>
///   <item>otherwise packs whole lines up to ~<see cref="MaxTokens"/> tokens;</item>
///   <item>stamps each chunk with the physical <c>SourcePage</c> of its first line (the citation page).</item>
/// </list>
/// Char offsets are into the concatenated Markdown document (reconstruction only; page nav uses the
/// page number). Token counts use the same cl100k tiktoken vocab as the embedder. Stateless/thread-safe.
/// </summary>
public sealed class MarkdownChunker
{
    /// <summary>Target upper bound on tokens per non-table chunk.</summary>
    public const int MaxTokens = 512;

    // ATX heading: 1–6 leading '#', a space, then the title (trailing '#'/space trimmed off).
    private static readonly Regex HeadingRe = new(@"^(#{1,6})\s+(.+?)\s*#*\s*$", RegexOptions.Compiled);

    private readonly Tokenizer _tokenizer;
    private readonly int _maxTokens;

    public MarkdownChunker() : this(MaxTokens) { }

    /// <summary>Test/override ctor for custom window sizes.</summary>
    public MarkdownChunker(int maxTokens)
    {
        if (maxTokens <= 0) throw new ArgumentOutOfRangeException(nameof(maxTokens));
        _maxTokens = maxTokens;
        _tokenizer = TiktokenTokenizer.CreateForModel("text-embedding-3-small");
    }

    /// <summary>
    /// Concatenates the pages (keeping an offset→page map), then splits into structure-aware chunks.
    /// Returns an empty list when there is no non-whitespace content.
    /// </summary>
    public IReadOnlyList<MarkdownChunk> Chunk(IReadOnlyList<PdfPageMarkdown> pages)
    {
        if (pages is null || pages.Count == 0)
            return [];

        var (doc, lines) = BuildLines(pages);
        if (lines.Count == 0)
            return [];

        var chunks = new List<MarkdownChunk>();
        var section = new List<string>();   // section-path stack, index = heading level - 1
        var ord = 0;

        // Open-chunk state.
        var firstLine = -1;
        var lastLine = -1;
        var bufferTokens = 0;
        string? bufferSection = null;

        void Flush()
        {
            if (firstLine < 0) return;
            var start = lines[firstLine].Start;
            var end = lines[lastLine].End;
            var text = doc[start..end];
            if (!string.IsNullOrWhiteSpace(text))
            {
                chunks.Add(new MarkdownChunk(
                    ord++, text, _tokenizer.CountTokens(text), start, end,
                    lines[firstLine].Page, bufferSection));
            }
            firstLine = -1;
            lastLine = -1;
            bufferTokens = 0;
            bufferSection = null;
        }

        void Open(int idx)
        {
            firstLine = idx;
            lastLine = idx;
            bufferTokens = 0;
            bufferSection = CurrentPath(section);
        }

        var i = 0;
        while (i < lines.Count)
        {
            var line = lines[i];

            // Blank line: keep it attached to an open chunk (preserves spacing/offsets), else skip.
            if (line.IsBlank)
            {
                if (firstLine >= 0) lastLine = i;
                i++;
                continue;
            }

            // Heading → new section + new chunk starting at the heading line.
            if (line.HeadingLevel > 0)
            {
                Flush();
                PushHeading(section, line.HeadingLevel, line.HeadingText);
                Open(i);
                bufferTokens = _tokenizer.CountTokens(line.Text);
                lastLine = i;
                i++;
                continue;
            }

            // Table block: a pipe row whose next line is a delimiter row. Consume the whole block; never split it.
            if (line.IsTableRow && i + 1 < lines.Count && lines[i + 1].IsTableDelimiter)
            {
                var j = i;
                while (j < lines.Count && lines[j].IsTableRow) j++;
                var blockText = doc[lines[i].Start..lines[j - 1].End];
                var blockTokens = _tokenizer.CountTokens(blockText);

                // Flush an open chunk that can't fit the whole table (keep the table intact).
                if (firstLine >= 0 && bufferTokens > 0 && bufferTokens + blockTokens > _maxTokens)
                    Flush();
                if (firstLine < 0) Open(i);

                bufferTokens += blockTokens;
                lastLine = j - 1;
                i = j;

                // An oversized table becomes its own chunk (take-at-least-one).
                if (bufferTokens >= _maxTokens) Flush();
                continue;
            }

            // Normal line — pack up to the token budget.
            var lineTokens = _tokenizer.CountTokens(line.Text);
            if (firstLine >= 0 && bufferTokens > 0 && bufferTokens + lineTokens > _maxTokens)
                Flush();
            if (firstLine < 0) Open(i);
            bufferTokens += lineTokens;
            lastLine = i;
            i++;
        }

        Flush();
        return chunks;
    }

    // ---- helpers ----

    private readonly record struct Line(
        string Text, int Start, int End, int Page,
        bool IsBlank, int HeadingLevel, string HeadingText, bool IsTableRow, bool IsTableDelimiter);

    /// <summary>
    /// Concatenates pages into one document string (a blank line between pages) and returns the
    /// classified, offset-carrying lines. Each line's <c>Text</c> slices back from the document
    /// (<c>doc[Start..End]</c>).
    /// </summary>
    private static (string Doc, List<Line> Lines) BuildLines(IReadOnlyList<PdfPageMarkdown> pages)
    {
        var sb = new StringBuilder();
        var lines = new List<Line>();

        foreach (var page in pages)
        {
            var normalized = (page.Markdown ?? string.Empty).Replace("\r\n", "\n").Replace('\r', '\n');
            foreach (var raw in normalized.Split('\n'))
            {
                var start = sb.Length;
                sb.Append(raw);
                var end = sb.Length;
                sb.Append('\n');
                lines.Add(Classify(raw, start, end, page.Page));
            }
            // Blank separator line between pages (its own offset gap; harmless).
            sb.Append('\n');
        }

        return (sb.ToString(), lines);
    }

    private static Line Classify(string text, int start, int end, int page)
    {
        var trimmed = text.Trim();
        if (trimmed.Length == 0)
            return new Line(text, start, end, page, IsBlank: true, 0, string.Empty, false, false);

        var heading = HeadingRe.Match(trimmed);
        if (heading.Success)
            return new Line(text, start, end, page, false, heading.Groups[1].Value.Length, heading.Groups[2].Value.Trim(), false, false);

        var isTableRow = IsTableRow(trimmed);
        var isDelimiter = isTableRow && IsDelimiterRow(trimmed);
        return new Line(text, start, end, page, false, 0, string.Empty, isTableRow, isDelimiter);
    }

    /// <summary>A GFM table row: starts and ends with '|' and has at least one interior cell.</summary>
    private static bool IsTableRow(string trimmed) =>
        trimmed.Length >= 2 && trimmed[0] == '|' && trimmed[^1] == '|' && trimmed.Count(c => c == '|') >= 2;

    /// <summary>The delimiter row under a table header: cells contain only '-', ':' and spaces (≥1 dash).</summary>
    private static bool IsDelimiterRow(string trimmed)
    {
        var hasDash = false;
        foreach (var c in trimmed)
        {
            if (c == '-') hasDash = true;
            else if (c is not ('|' or ':' or ' ')) return false;
        }
        return hasDash;
    }

    /// <summary>Truncate the stack to the heading's parent depth (padding skipped levels), then push.</summary>
    private static void PushHeading(List<string> stack, int level, string text)
    {
        while (stack.Count >= level) stack.RemoveAt(stack.Count - 1);
        while (stack.Count < level - 1) stack.Add(string.Empty);
        stack.Add(text);
    }

    /// <summary>The section breadcrumb (non-empty levels joined by " › "), or null at document root.</summary>
    private static string? CurrentPath(List<string> stack)
    {
        var parts = stack.Where(s => s.Length > 0).ToList();
        return parts.Count == 0 ? null : string.Join(" › ", parts);
    }
}
