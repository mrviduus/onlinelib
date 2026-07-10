namespace TextStack.Ai.EvalSuite;

/// <summary>
/// One golden PDF page for the vision-RAG eval (ADR-012 S3). <see cref="ImageResource"/> is the
/// embedded fixture image (a SYNTHETIC, original table-page rendered to JPEG — no copyrighted content)
/// the vision model transcribes; <see cref="ExpectedTableFacts"/> are fact SUBSTRINGS (not exact
/// strings) a faithful transcription must contain — every one is a table-cell value, so a correct
/// transcription lands them all inside one structure-aware chunk.
/// </summary>
public sealed record PdfVisionPageGolden(int Page, string ImageResource, IReadOnlyList<string> ExpectedTableFacts);

/// <summary>
/// One golden Q&amp;A whose answer lives ONLY in a table cell of <see cref="ExpectedPage"/> —
/// <see cref="ExpectedAnswerFacts"/> are fact substrings a correct answer must contain, and
/// <see cref="ExpectedPage"/> is the physical page a correct citation must point at.
/// </summary>
public sealed record PdfVisionQaGolden(string Question, IReadOnlyList<string> ExpectedAnswerFacts, int ExpectedPage);

/// <summary>The whole <c>pdfvision.json</c> golden: the page set (transcription targets) + the Q&amp;A set.</summary>
public sealed record PdfVisionGolden(
    IReadOnlyList<PdfVisionPageGolden> Pages,
    IReadOnlyList<PdfVisionQaGolden> Questions);

/// <summary>
/// Loads the embedded PDF-vision golden + fixture images. Public (like <see cref="RagGoldenSet"/>) so the
/// <see cref="PdfVisionEvalRunner"/> and tests read the identical fixtures the API ships.
/// </summary>
public static class PdfVisionGoldenSet
{
    /// <summary>The page + Q&amp;A golden (<c>pdfvision.json</c>, a single JSON object).</summary>
    public static PdfVisionGolden Load() => GoldenLoader.LoadSingle<PdfVisionGolden>("pdfvision.json");

    /// <summary>Raw JPEG bytes for a page's <see cref="PdfVisionPageGolden.ImageResource"/>.</summary>
    public static byte[] LoadImage(string imageResource) =>
        GoldenLoader.LoadBytes("Datasets.pdfvision." + imageResource);
}
