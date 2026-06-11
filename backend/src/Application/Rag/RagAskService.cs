using Application.Ai;
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
/// "Ask this book" (Phase 4 RAG, AI-025). Interface so the AI-027 citation eval can drive generation
/// against pre-retrieved chunks (no reading user) and tests can fake it.
/// </summary>
public interface IRagAskService
{
    /// <summary>Spoiler-safe ask for a real reader: gates context by their reading progress.</summary>
    Task<AskAnswer> AskAsync(Guid userId, Guid siteId, Guid editionId, string question, int k, CancellationToken ct);

    /// <summary>
    /// Generate a grounded, cited answer from an already-retrieved chunk set — bypasses user-progress
    /// gating (the caller supplies the chunks). Used by the AI-027 citation eval over the golden set.
    /// </summary>
    Task<AskAnswer> AskFromChunksAsync(
        string question, IReadOnlyList<RetrievedChunk> chunks, IReadOnlyList<string> noteTexts,
        int lastReadOrd, CancellationToken ct);
}

/// <summary>
/// "Ask this book" (Phase 4 RAG, AI-025): retrieves spoiler-safe context via
/// <see cref="RagContextService"/>, generates a grounded 2-4 sentence answer with citations via the
/// LLM gateway (FeatureTag <c>rag.ask</c>), and resolves the cited excerpts. Reused by the AI-027 eval.
/// </summary>
public sealed class RagAskService(RagContextService context, ILlmService llm) : IRagAskService
{
    public const string FeatureTag = "rag.ask";
    private const int MaxOutputTokens = 320;

    private const string InsufficientMessage =
        "You haven't read enough of this book yet for me to answer from it. Keep reading and ask again.";

    public async Task<AskAnswer> AskAsync(
        Guid userId, Guid siteId, Guid editionId, string question, int k, CancellationToken ct)
    {
        var ctx = await context.BuildAsync(userId, siteId, editionId, question, k, ct);
        var noteTexts = ctx.Notes.Select(n => n.Text).ToList();
        return await AskFromChunksAsync(question, ctx.Chunks, noteTexts, ctx.LastReadOrd, ct);
    }

    public async Task<AskAnswer> AskFromChunksAsync(
        string question, IReadOnlyList<RetrievedChunk> chunks, IReadOnlyList<string> noteTexts,
        int lastReadOrd, CancellationToken ct)
    {
        // No readable context → answer plainly without spending an LLM call.
        if (chunks.Count == 0)
            return new AskAnswer(InsufficientMessage, [], lastReadOrd, Insufficient: true);

        var request = new LlmRequest(
            SystemPrompt: RagAskPrompt.BuildSystemPrompt(),
            Messages: [new LlmMessage("user", RagAskPrompt.BuildUserPrompt(question, chunks, noteTexts))],
            MaxOutputTokens: MaxOutputTokens,
            FeatureTag: FeatureTag);

        var response = await llm.CompleteAsync(request, ct);

        var markers = RagAskPrompt.ParseCitations(response.Text, chunks.Count);
        var citations = markers.Select(n => new AskCitationSource(n, chunks[n - 1])).ToList();

        return new AskAnswer(response.Text, citations, lastReadOrd, Insufficient: false);
    }
}
