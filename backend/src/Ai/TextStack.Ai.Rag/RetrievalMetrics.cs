namespace TextStack.Ai.Rag;

/// <summary>
/// Pure, deterministic retrieval-quality metrics for the Phase 4 RAG eval (AI-027). No LLM and no DB —
/// they score an already-retrieved chunk list, so the math is unit-testable in CI while the real
/// retrieval runs offline against the embedded corpus (admin "Run RAG eval").
/// </summary>
public static class RetrievalMetrics
{
    /// <summary>
    /// True if any retrieved chunk satisfies the golden: it comes from the expected chapter AND its
    /// text contains at least one expected phrase (case-insensitive). The two signals together guard
    /// against a right-chapter-wrong-content (or right-words-wrong-chapter) false positive.
    /// </summary>
    public static bool IsHit(
        IEnumerable<RetrievedChunk> retrieved, int expectedChapterOrd, IReadOnlyList<string> expectedPhrases)
    {
        foreach (var c in retrieved)
        {
            if (c.ChapterOrd != expectedChapterOrd)
                continue;
            foreach (var phrase in expectedPhrases)
            {
                if (!string.IsNullOrWhiteSpace(phrase)
                    && c.Text.Contains(phrase, StringComparison.OrdinalIgnoreCase))
                    return true;
            }
        }
        return false;
    }

    /// <summary>
    /// recall@k over the golden set: the fraction of cases whose top-k retrieval is a <see cref="IsHit"/>.
    /// Empty set → 1.0 (vacuously perfect; the runner reports N so an empty run is visible).
    /// </summary>
    public static double Recall(
        IReadOnlyList<(IReadOnlyList<RetrievedChunk> Retrieved, int ExpectedChapterOrd, IReadOnlyList<string> ExpectedPhrases)> cases)
    {
        if (cases.Count == 0)
            return 1.0;
        var hits = cases.Count(c => IsHit(c.Retrieved, c.ExpectedChapterOrd, c.ExpectedPhrases));
        return (double)hits / cases.Count;
    }

    /// <summary>Number of retrieved chunks that leak past the spoiler gate (<c>chapter_ord &gt; gate</c>).</summary>
    public static int LeakCount(IEnumerable<RetrievedChunk> retrieved, int gateChapterOrd) =>
        retrieved.Count(c => c.ChapterOrd > gateChapterOrd);

    /// <summary>
    /// Spoiler-leak rate: the fraction of adversarial cases where retrieval surfaced ANY chunk from a
    /// chapter past the gate. DoD requires this to be 0. Empty set → 0.0 (nothing leaked).
    /// </summary>
    public static double LeakRate(
        IReadOnlyList<(IReadOnlyList<RetrievedChunk> Retrieved, int GateChapterOrd)> cases)
    {
        if (cases.Count == 0)
            return 0.0;
        var leaking = cases.Count(c => LeakCount(c.Retrieved, c.GateChapterOrd) > 0);
        return (double)leaking / cases.Count;
    }
}
