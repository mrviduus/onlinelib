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
