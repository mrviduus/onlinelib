/**
 * Resolves a RAG citation's chapter ordinal to the chapter's slug, for navigating the reader to the
 * cited chapter (AI-026). Returns undefined when no chapter matches.
 */
export function citationChapterSlug(
  chapters: { chapterNumber?: number; slug: string }[],
  chapterOrd: number,
): string | undefined {
  return chapters.find(c => c.chapterNumber === chapterOrd)?.slug
}

/** The chapter a citation points at, when the reader's chapter list is available. */
export function citationChapter<T extends { chapterNumber?: number; title?: string }>(
  chapters: T[],
  chapterOrd: number | null | undefined,
): T | undefined {
  if (chapterOrd == null) return undefined
  return chapters.find(c => c.chapterNumber === chapterOrd)
}

/**
 * What a citation chip says.
 *
 * It used to say `ch.0`, six times, under an answer citing `[1][6][7][13][14][17]` — and QA could
 * not match a single marker to a single chip. Two separate faults wearing one symptom:
 *
 * 1. **`chapterOrd` is 0-based.** `ch.0` was not a null leaking through; it is the first chapter,
 *    the one titled "Book I". Every other reader surface prints either the title or `ord + 1`
 *    (`ReaderTocDrawer`, `ReaderFooterNav`), so the chip was the one place showing the internal
 *    index. It prefers the real title now, and falls back to `ch.{ord + 1}` when the chapter list
 *    is not to hand.
 * 2. **The marker was thrown away.** `AskCitation.marker` carries the `[n]` from the answer text and
 *    mobile never rendered it — and mobile deliberately does not make the inline markers tappable,
 *    so the chip is the only place the two could ever have been joined.
 */
export function citationLabel(
  citation: { marker?: number; chapterOrd?: number | null; sourcePage?: number | null },
  chapters: { chapterNumber?: number; title?: string }[] = [],
): string {
  const marker = citation.marker != null ? `[${citation.marker}] ` : ''

  if (citation.sourcePage != null) return `${marker}p.${citation.sourcePage}`

  const title = citationChapter(chapters, citation.chapterOrd)?.title?.trim()
  if (title) return `${marker}${title}`

  // No chapter list (or no match): show the human 1-based number rather than the stored ordinal.
  if (citation.chapterOrd != null) return `${marker}ch.${citation.chapterOrd + 1}`

  return marker.trim() || '—'
}

const SNIPPET_MAX = 40
const SNIPPET_MIN = 12

/**
 * A short, distinctive prefix of a citation's preview, cut at a word boundary. Kept short so it's
 * likely to sit within a single DOM text node — citation scroll locates the passage by searching the
 * rendered text for this snippet (the chunk offsets are into PlainText, not the rendered DOM). Both
 * web (AI-026b) and the mobile WebView (AI-026d) use it. Returns '' when there isn't enough to match on.
 */
export function makeSnippet(preview: string): string {
  const text = preview.replace(/\s+/g, ' ').trim()
  if (text.length < SNIPPET_MIN) return ''
  if (text.length <= SNIPPET_MAX) return text
  const cut = text.slice(0, SNIPPET_MAX)
  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace >= SNIPPET_MIN ? cut.slice(0, lastSpace) : cut
}
