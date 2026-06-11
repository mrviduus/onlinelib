namespace TextStack.Ai.EvalSuite;

/// <summary>
/// One RAG retrieval golden case (AI-027): a question plus the chapter and key phrases a correct
/// top-k retrieval must surface. Recall scores a hit when a retrieved chunk from
/// <see cref="ExpectedChapterOrd"/> contains one of <see cref="ExpectedPhrases"/> (case-insensitive).
/// </summary>
/// <param name="ExpectedChapterOrd">
/// The chapter ordinal (edition <c>ChapterNumber</c>) the answer lives in. NB: align this to the
/// target edition's numbering — front matter can offset content chapters.
/// </param>
public record RagGolden(string Question, int ExpectedChapterOrd, IReadOnlyList<string> ExpectedPhrases);

/// <summary>
/// One adversarial spoiler case (AI-027): a question whose answer is in <see cref="AboutChapterOrd"/>,
/// asked as if the reader has only reached <see cref="GateChapterOrd"/>. Retrieval gated at the latter
/// must surface NOTHING from a later chapter (the DoD spoiler-leak = 0 guard).
/// </summary>
public record RagSpoilerGolden(string Question, int AboutChapterOrd, int GateChapterOrd);

/// <summary>
/// Loads the embedded RAG golden datasets. Public (unlike the internal <c>GoldenLoader</c>) so the
/// <see cref="RagEvalRunner"/> and tests can read them.
/// </summary>
public static class RagGoldenSet
{
    /// <summary>Retrieval recall goldens (<c>rag.json</c>).</summary>
    public static IReadOnlyList<RagGolden> LoadRetrieval() => GoldenLoader.Load<RagGolden>("rag.json");

    /// <summary>Adversarial spoiler goldens (<c>rag_spoiler.json</c>).</summary>
    public static IReadOnlyList<RagSpoilerGolden> LoadSpoiler() => GoldenLoader.Load<RagSpoilerGolden>("rag_spoiler.json");
}
