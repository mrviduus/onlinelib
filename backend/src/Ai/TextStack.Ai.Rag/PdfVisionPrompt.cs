namespace TextStack.Ai.Rag;

/// <summary>
/// The single source of truth for the PDF vision-transcription prompt (ADR-012 S3). The production
/// parser (<c>Infrastructure.Rag.PdfVisionParser</c>) and the <c>pdfvision</c> eval gate both transcribe
/// a rendered page with THIS system/user prompt + output budget, so the eval measures the exact prompt
/// prod ships (no drift). Kept here (framework-free) rather than in Infrastructure so the EvalSuite can
/// reference it without depending on the storage/PDFium parser.
/// </summary>
public static class PdfVisionPrompt
{
    /// <summary>A dense page of Markdown is well under this; padded by the client's reasoning reserve.</summary>
    public const int MaxOutputTokens = 4096;

    public const string SystemPrompt =
        "You transcribe a single scanned book/document page to clean GitHub-flavored Markdown. " +
        "Render tables as Markdown tables, preserve headings (with #), lists and reading order. " +
        "Output ONLY the page's Markdown — no commentary, no explanation, and do NOT wrap the whole " +
        "output in a ``` code fence.";

    public const string UserPrompt =
        "Transcribe this page to clean GitHub-flavored Markdown.";
}
