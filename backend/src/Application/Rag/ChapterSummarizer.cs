using Application.Ai;
using TextStack.Ai.Core;

namespace Application.Rag;

/// <summary>
/// Writes one faithful ~150-250 word summary of a chapter's plain text via the LLM gateway, for the
/// precomputed per-chapter RAG summaries ("S2"). Routed on the NEW FeatureTag <see cref="FeatureTag"/> →
/// the cheap OpenAI nano (<c>Ai:Routes:rag.summarize = "openai"</c> in the Worker AND API configs). The
/// prompt/clamp is the pure <see cref="ChapterSummaryPrompt"/>; this class is the thin LLM seam so the
/// chunking service depends on one small collaborator rather than the gateway directly.
///
/// Throws on an LLM failure — the caller (<c>BookChunkingService</c>) catches per chapter and skips it, so
/// one bad summary never fails an indexing run (summaries are a best-effort enhancement).
/// </summary>
public sealed class ChapterSummarizer(ILlmService llm)
{
    public const string FeatureTag = "rag.summarize";

    /// <summary>
    /// Summarizes <paramref name="plainText"/>. Returns the trimmed model text, or empty when the input
    /// has no usable text (no LLM call). Throws on an LLM failure so the caller can log-and-skip.
    /// </summary>
    public async Task<string> SummarizeAsync(string? plainText, CancellationToken ct)
    {
        var userPrompt = ChapterSummaryPrompt.BuildUserPrompt(plainText);
        if (string.IsNullOrWhiteSpace(userPrompt))
            return string.Empty;

        var request = new LlmRequest(
            SystemPrompt: ChapterSummaryPrompt.BuildSystemPrompt(),
            Messages: [new LlmMessage("user", userPrompt)],
            MaxOutputTokens: ChapterSummaryPrompt.MaxOutputTokens,
            FeatureTag: FeatureTag);

        var response = await llm.CompleteAsync(request, ct);
        return response.Text?.Trim() ?? string.Empty;
    }
}
