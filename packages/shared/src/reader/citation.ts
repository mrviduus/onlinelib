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
