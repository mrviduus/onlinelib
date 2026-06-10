using Microsoft.ML.Tokenizers;

namespace TextStack.Ai.Rag;

/// <summary>
/// Sentence-aware chunker. Splits plain text into sentences (offset-preserving), then packs
/// them into ~<see cref="MaxTokens"/>-token windows with a ~<see cref="OverlapTokens"/>-token
/// trailing overlap between consecutive chunks. Token counts use the exact cl100k tiktoken
/// vocab (same as <c>text-embedding-3-small</c>), built once and reused (thread-safe).
/// </summary>
public sealed class Chunker : IChunker
{
    /// <summary>Target upper bound on tokens per chunk.</summary>
    public const int MaxTokens = 512;

    /// <summary>Approximate token overlap re-included at the start of the next chunk.</summary>
    public const int OverlapTokens = 64;

    private readonly Tokenizer _tokenizer;
    private readonly int _maxTokens;
    private readonly int _overlapTokens;

    public Chunker() : this(MaxTokens, OverlapTokens) { }

    /// <summary>Test/override ctor for custom window sizes.</summary>
    public Chunker(int maxTokens, int overlapTokens)
    {
        if (maxTokens <= 0) throw new ArgumentOutOfRangeException(nameof(maxTokens));
        if (overlapTokens < 0 || overlapTokens >= maxTokens)
            throw new ArgumentOutOfRangeException(nameof(overlapTokens));
        _maxTokens = maxTokens;
        _overlapTokens = overlapTokens;
        // cl100k_base vocab ships in Microsoft.ML.Tokenizers.Data.Cl100kBase (offline).
        _tokenizer = TiktokenTokenizer.CreateForModel("text-embedding-3-small");
    }

    public IReadOnlyList<TextChunk> Chunk(string plainText)
    {
        if (string.IsNullOrWhiteSpace(plainText))
            return [];

        var sentences = SplitSentences(plainText);
        if (sentences.Count == 0)
            return [];

        // Per-sentence token counts drive boundary decisions; the stored TokenCount is the
        // exact count of the final joined slice (whitespace between sentences may tokenize
        // slightly differently than the sum of parts).
        var counts = new int[sentences.Count];
        for (var i = 0; i < sentences.Count; i++)
            counts[i] = _tokenizer.CountTokens(sentences[i].Text);

        var chunks = new List<TextChunk>();
        var ord = 0;
        var idx = 0;
        while (idx < sentences.Count)
        {
            var windowStart = idx;
            var tokenSum = 0;
            var lastIdx = idx;
            while (idx < sentences.Count)
            {
                // Always take at least one sentence, even if it alone exceeds the budget.
                if (tokenSum > 0 && tokenSum + counts[idx] > _maxTokens)
                    break;
                tokenSum += counts[idx];
                lastIdx = idx;
                idx++;
            }

            var charStart = sentences[windowStart].Start;
            var charEnd = sentences[lastIdx].End;
            var text = plainText[charStart..charEnd];
            chunks.Add(new TextChunk(ord++, text, _tokenizer.CountTokens(text), charStart, charEnd));

            if (idx >= sentences.Count)
                break;

            // Overlap: walk back from the last sentence, re-including trailing sentences whose
            // cumulative tokens stay within the overlap budget; the next window starts there.
            var overlapSum = 0;
            var nextStart = lastIdx + 1;
            for (var b = lastIdx; b > windowStart; b--)
            {
                if (overlapSum + counts[b] > _overlapTokens)
                    break;
                overlapSum += counts[b];
                nextStart = b;
            }
            // Guarantee forward progress (avoid restarting on the same window).
            idx = Math.Max(nextStart, windowStart + 1);
        }

        return chunks;
    }

    private const string Terminators = ".!?…";          // . ! ? …
    private const string Closers = "\"')]”’";      // " ' ) ] ” ’

    /// <summary>
    /// Offset-preserving sentence split: each span runs from its first non-whitespace char
    /// through its terminating punctuation (plus any closing quotes/brackets). A trailing
    /// run without terminal punctuation becomes a final sentence. Approximate (over-splits
    /// abbreviations like "Mr.") but offsets are exact, since chunks slice the original text.
    /// </summary>
    public static List<Sentence> SplitSentences(string text)
    {
        var result = new List<Sentence>();
        var n = text.Length;
        var start = -1;
        var i = 0;
        while (i < n)
        {
            if (start < 0)
            {
                if (!char.IsWhiteSpace(text[i])) start = i;
                i++;
                continue;
            }

            if (Terminators.IndexOf(text[i]) >= 0)
            {
                var end = i + 1;
                while (end < n && Terminators.IndexOf(text[end]) >= 0) end++;
                while (end < n && Closers.IndexOf(text[end]) >= 0) end++;
                result.Add(new Sentence(text[start..end], start, end));
                start = -1;
                i = end;
                continue;
            }

            i++;
        }

        if (start >= 0)
        {
            var end = n;
            while (end > start && char.IsWhiteSpace(text[end - 1])) end--;
            if (end > start)
                result.Add(new Sentence(text[start..end], start, end));
        }

        return result;
    }

    /// <summary>A sentence span with its offsets into the source text.</summary>
    public readonly record struct Sentence(string Text, int Start, int End);
}
