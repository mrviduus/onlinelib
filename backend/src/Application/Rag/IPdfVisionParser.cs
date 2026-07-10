using TextStack.Ai.Rag;

namespace Application.Rag;

/// <summary>
/// Vision-LLM PDF→Markdown parser (ADR-012 S3): renders each page and transcribes it to clean
/// GitHub-flavored Markdown via <c>gpt-4.1</c> vision (routed as the <c>pdf.parse</c> feature), so
/// the RAG index reasons over faithful Markdown tables instead of the deterministic extractor's
/// table-jumbling prose. Bounded parallelism, page-capped (<c>Ai:Pdf:MaxParsePages</c>). Best-effort:
/// returns an EMPTY list on total failure (render error, missing key, budget hard-stop) so the caller
/// falls back to the deterministic chunker rather than failing the index.
/// </summary>
public interface IPdfVisionParser
{
    /// <summary>
    /// Loads the stored PDF at <paramref name="storagePath"/> and returns its pages as Markdown,
    /// ordered by page. Beyond the configured page cap, only the cap is parsed (partial, logged).
    /// An empty result signals the caller to fall back to deterministic chunking.
    /// </summary>
    Task<IReadOnlyList<PdfPageMarkdown>> ParseAsync(string storagePath, CancellationToken ct);
}
