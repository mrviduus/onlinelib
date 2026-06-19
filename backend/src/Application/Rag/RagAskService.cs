using System.Runtime.CompilerServices;
using System.Text;
using Application.Ai;
using Contracts.Books;
using TextStack.Ai.Core;
using TextStack.Ai.Rag;

namespace Application.Rag;

/// <summary>A cited excerpt: its <c>[n]</c> marker in the answer plus the chunk it points to.</summary>
public record AskCitationSource(int Marker, RetrievedChunk Chunk);

/// <summary>
/// The answer produced by <see cref="RagAskService"/>. <see cref="Insufficient"/> is true when the
/// user hasn't read enough to have any context (no LLM call was made).
/// </summary>
public record AskAnswer(
    string Answer,
    IReadOnlyList<AskCitationSource> Citations,
    int LastReadOrd,
    bool Insufficient);

/// <summary>
/// A streaming chunk of an "Ask this book" answer (AI-028). Exactly one field is set per item: a
/// <see cref="TextDelta"/> partial text fragment as it arrives, or the terminal <see cref="Terminal"/>
/// (citations + lastReadOrd + insufficient) that closes the stream. An <see cref="Error"/> item is the
/// terminal item on failure.
/// </summary>
public record AskStreamItem(
    string? TextDelta = null,
    AskTerminal? Terminal = null,
    string? Error = null);

/// <summary>The terminal payload of a streamed answer: resolved citations + gating metadata.</summary>
public record AskTerminal(
    IReadOnlyList<AskCitationSource> Citations,
    int LastReadOrd,
    bool Insufficient);

/// <summary>
/// "Ask this book" (Phase 4 RAG, AI-025). Interface so the AI-027 citation eval can drive generation
/// against pre-retrieved chunks (no reading user) and tests can fake it.
/// </summary>
public interface IRagAskService
{
    /// <summary>
    /// Spoiler-safe ask for a real reader: gates context by their reading progress. Pass
    /// <paramref name="currentChapterId"/> (the chapter open in the reader) so it counts as read even
    /// before the debounced progress-save persists — resolved server-side, ignored if not this edition.
    /// <paramref name="history"/> carries prior conversation turns (multi-turn memory); retrieval still
    /// runs on <paramref name="question"/> only.
    /// </summary>
    Task<AskAnswer> AskAsync(
        Guid userId, Guid siteId, Guid editionId, string question, int k,
        Guid? currentChapterId, IReadOnlyList<AskTurnDto> history, CancellationToken ct);

    /// <summary>
    /// Generate a grounded, cited answer from an already-retrieved chunk set — bypasses user-progress
    /// gating (the caller supplies the chunks). Used by the AI-027 citation eval over the golden set.
    /// <paramref name="history"/> is the prior conversation (pass <c>[]</c> for a single-shot grounding eval).
    /// </summary>
    Task<AskAnswer> AskFromChunksAsync(
        string question, IReadOnlyList<RetrievedChunk> chunks, IReadOnlyList<string> noteTexts,
        IReadOnlyList<AskTurnDto> history, int lastReadOrd, CancellationToken ct);
}

/// <summary>
/// "Ask this book" (Phase 4 RAG, AI-025): retrieves spoiler-safe context via
/// <see cref="RagContextService"/>, generates a grounded, conversational answer with citations via the
/// LLM gateway (FeatureTag <c>rag.ask</c>), and resolves the cited excerpts. Multi-turn (AI-028):
/// prior conversation turns are clamped + threaded into the chat. Streaming via <see cref="StreamAsync"/>.
/// Reused by the AI-027 eval.
/// </summary>
public sealed class RagAskService(RagContextService context, ILlmService llm) : IRagAskService
{
    public const string FeatureTag = "rag.ask";

    // Raised for conversational length (AI-028: companion tone, multi-sentence replies).
    private const int MaxOutputTokens = 400;

    private const string InsufficientMessage =
        "I don't see enough of this book in what you've read so far to answer that yet. " +
        "Keep reading and ask me again — I'll be here.";

    public async Task<AskAnswer> AskAsync(
        Guid userId, Guid siteId, Guid editionId, string question, int k,
        Guid? currentChapterId, IReadOnlyList<AskTurnDto> history, CancellationToken ct)
    {
        var ctx = await context.BuildAsync(userId, siteId, editionId, question, k, currentChapterId, ct);
        var noteTexts = ctx.Notes.Select(n => n.Text).ToList();
        return await AskFromChunksAsync(question, ctx.Chunks, noteTexts, history, ctx.LastReadOrd, ct);
    }

    public async Task<AskAnswer> AskFromChunksAsync(
        string question, IReadOnlyList<RetrievedChunk> chunks, IReadOnlyList<string> noteTexts,
        IReadOnlyList<AskTurnDto> history, int lastReadOrd, CancellationToken ct)
    {
        // No readable context → answer plainly without spending an LLM call.
        if (chunks.Count == 0)
            return new AskAnswer(InsufficientMessage, [], lastReadOrd, Insufficient: true);

        var request = BuildRequest(question, chunks, noteTexts, history);
        var response = await llm.CompleteAsync(request, ct);

        var citations = ResolveCitations(response.Text, chunks);
        return new AskAnswer(response.Text, citations, lastReadOrd, Insufficient: false);
    }

    /// <summary>
    /// Streaming "Ask this book" (AI-028): same context build + gate as <see cref="AskFromChunksAsync"/>,
    /// then streams the answer as <see cref="AskStreamItem"/> text deltas, accumulating server-side; on
    /// completion runs the EXISTING <c>[n]</c> citation parse over the full text and emits a single
    /// terminal item with resolved citations. Empty chunks → one friendly delta + an insufficient
    /// terminal (no model call). A mid-stream failure emits an <see cref="AskStreamItem.Error"/> terminal.
    /// </summary>
    public async IAsyncEnumerable<AskStreamItem> StreamAsync(
        string question, IReadOnlyList<RetrievedChunk> chunks, IReadOnlyList<string> noteTexts,
        IReadOnlyList<AskTurnDto> history, int lastReadOrd,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        // No readable context → friendly message + insufficient terminal, no LLM call.
        if (chunks.Count == 0)
        {
            yield return new AskStreamItem(TextDelta: InsufficientMessage);
            yield return new AskStreamItem(Terminal: new AskTerminal([], lastReadOrd, Insufficient: true));
            yield break;
        }

        var request = BuildRequest(question, chunks, noteTexts, history);

        var text = new StringBuilder();
        string? error = null;

        // Provider resolution happens inside StreamAsync (gateway → keyed provider ctor) and can throw
        // on a keyless host — surface that as an error terminal, not a broken stream.
        IAsyncEnumerable<LlmDelta>? stream = null;
        try
        {
            stream = llm.StreamAsync(request, ct);
        }
        catch (Exception)
        {
            error = "Ask is temporarily unavailable.";
        }

        if (error is null)
        {
            await using var e = stream!.GetAsyncEnumerator(ct);
            while (true)
            {
                LlmDelta delta;
                try
                {
                    if (!await e.MoveNextAsync())
                        break;
                    delta = e.Current;
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested)
                {
                    throw; // client disconnected — nothing to emit
                }
                catch (Exception)
                {
                    error = "Ask is temporarily unavailable.";
                    break;
                }

                if (delta.TextDelta is { Length: > 0 } fragment)
                {
                    text.Append(fragment);
                    yield return new AskStreamItem(TextDelta: fragment);
                }
            }
        }

        if (error is not null)
        {
            yield return new AskStreamItem(Error: error);
            yield break;
        }

        var citations = ResolveCitations(text.ToString(), chunks);
        yield return new AskStreamItem(Terminal: new AskTerminal(citations, lastReadOrd, Insufficient: false));
    }

    private static LlmRequest BuildRequest(
        string question, IReadOnlyList<RetrievedChunk> chunks, IReadOnlyList<string> noteTexts,
        IReadOnlyList<AskTurnDto> history)
    {
        var contextBlock = RagAskPrompt.BuildContextBlock(chunks, noteTexts);
        var messages = RagAskHistory.BuildMessages(contextBlock, history, question);
        return new LlmRequest(
            SystemPrompt: RagAskPrompt.BuildSystemPrompt(),
            Messages: messages,
            MaxOutputTokens: MaxOutputTokens,
            FeatureTag: FeatureTag);
    }

    private static IReadOnlyList<AskCitationSource> ResolveCitations(
        string answer, IReadOnlyList<RetrievedChunk> chunks)
    {
        var markers = RagAskPrompt.ParseCitations(answer, chunks.Count);
        return markers.Select(n => new AskCitationSource(n, chunks[n - 1])).ToList();
    }
}
