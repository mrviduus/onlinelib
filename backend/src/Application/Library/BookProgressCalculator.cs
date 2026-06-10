namespace Application.Library;

/// <summary>
/// Converts a chapter-level scroll percent into a book-wide reading percent.
///
/// The reader (web + mobile) reports how far the user has scrolled through the
/// CURRENT CHAPTER (0..1). Stored verbatim, that number lies on library cards:
/// 85% through chapter 2 of 10 showed as "85% of the book". This is the
/// server-side mirror of the client's <c>computeBookProgress</c>
/// (packages/shared/src/reader/bookProgress.ts) — same formula, one source of
/// truth across both surfaces.
///
///   bookPct = (Σ words before current chapter + currentWords * chapterPct) / totalWords
///
/// Falls back to equal-weight chapters when no word counts exist, and finally
/// to the raw chapter percent when the current chapter can't be located.
/// </summary>
public static class BookProgressCalculator
{
    /// <param name="orderedWordCounts">Chapter word counts in reading order.</param>
    /// <param name="currentIndex">0-based index of the chapter the user is in, or -1 if unknown.</param>
    /// <param name="chapterPercent">Scroll progress within the current chapter (0..1).</param>
    public static double Compute(IReadOnlyList<int> orderedWordCounts, int currentIndex, double chapterPercent)
    {
        var clamped = Math.Clamp(chapterPercent, 0.0, 1.0);

        // Can't place the chapter — don't fabricate a book position; return the
        // chapter percent unchanged (matches the client's null→caller-decides,
        // but here a number is required so chapter% is the least-wrong value).
        if (orderedWordCounts.Count == 0 || currentIndex < 0 || currentIndex >= orderedWordCounts.Count)
            return clamped;

        long total = 0;
        foreach (var w in orderedWordCounts) total += Math.Max(0, w);

        if (total > 0)
        {
            long before = 0;
            for (var i = 0; i < currentIndex; i++) before += Math.Max(0, orderedWordCounts[i]);
            var cur = Math.Max(0, orderedWordCounts[currentIndex]);
            return Math.Clamp((before + cur * clamped) / total, 0.0, 1.0);
        }

        // Equal-weight fallback — every chapter counts the same.
        return Math.Clamp((currentIndex + clamped) / orderedWordCounts.Count, 0.0, 1.0);
    }
}
