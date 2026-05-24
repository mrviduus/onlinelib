/**
 * Book-wide reading progress calculation.
 *
 * The WebView/web reader reports per-chapter scroll progress (0..1). That
 * tells the user how far they are through the CURRENT CHAPTER, not the
 * book — so a fresh chapter looks like 0% even on the last chapter of a
 * long book. Footers, ContinueReadingCard, and any progress UI surface
 * need a book-wide percent built from chapter scroll + chapter word counts.
 *
 * Lives in `@textstack/shared` so both mobile and (future) web readers
 * can share the same formula. Pure, no I/O — unit-tested via Vitest.
 *
 * Strategy:
 *   bookPct = (Σ wordCount of chapters BEFORE current + currentChapter.wordCount * chapterProgress) / totalWordCount
 *
 * Fallback when chapters lack wordCount (extractor didn't measure them
 * — happens for some legacy user uploads):
 *   bookPct = (chapterIndex + chapterProgress) / totalChapters
 *
 * Returns `null` in degenerate cases (no chapters, unknown slug, denom=0)
 * — callers should render a placeholder like '—' rather than a misleading
 * 0%.
 */

export interface ChapterWithCount {
  slug: string
  wordCount?: number | null
}

export function computeBookProgress(
  chapters: ChapterWithCount[],
  currentChapterSlug: string | null | undefined,
  chapterProgress: number,
  totalWordCount?: number,
): number | null {
  if (!chapters || chapters.length === 0 || !currentChapterSlug) return null
  const idx = chapters.findIndex(c => c.slug === currentChapterSlug)
  if (idx < 0) return null
  // Defend against NaN/Infinity coming from a WebView 0/0 in `scrollTop /
  // (docHeight - windowHeight)` — propagates and breaks downstream
  // arithmetic if not caught.
  const safeProg = typeof chapterProgress === 'number' && Number.isFinite(chapterProgress) ? chapterProgress : 0
  const clampedProg = Math.max(0, Math.min(1, safeProg))

  // Word-count-weighted path — accurate when extractor populated wordCount
  // on every chapter (long chapters contribute more than short ones).
  const hasAnyWordCount = chapters.some(c => typeof c.wordCount === 'number' && (c.wordCount ?? 0) > 0)
  if (hasAnyWordCount) {
    let completedWords = 0
    for (let i = 0; i < idx; i++) {
      const w = chapters[i].wordCount
      if (typeof w === 'number' && w > 0) completedWords += w
    }
    const curWords = (typeof chapters[idx].wordCount === 'number' && (chapters[idx].wordCount ?? 0) > 0)
      ? (chapters[idx].wordCount as number)
      : 0
    // Prefer the explicit totalWordCount caller passed in (book-level
    // canonical, may include chapters we didn't iterate over). Fall back
    // to the sum we just computed so the API stays usable for callers
    // that don't know the canonical total.
    const denom = totalWordCount && totalWordCount > 0
      ? totalWordCount
      : chapters.reduce((s, c) => s + (typeof c.wordCount === 'number' && c.wordCount > 0 ? c.wordCount : 0), 0)
    if (denom <= 0) return null
    const pct = (completedWords + curWords * clampedProg) / denom
    return Math.max(0, Math.min(1, pct))
  }

  // Equal-weight fallback — every chapter counts the same.
  return Math.max(0, Math.min(1, (idx + clampedProg) / chapters.length))
}
