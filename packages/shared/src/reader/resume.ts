import { chapterSlugForPage, type ChapterPageAnchor } from './pdfResume'
import { parsePdfPageLocator } from './pdfProgress'
import { parseScrollLocator } from './progressPayload'

/**
 * Where to reopen a book, and which chapter row a position belongs to.
 *
 * Both answers come down to one rule, learned the expensive way: **the locator is the position,
 * and everything else is a derived field that can lag.**
 *
 * What went wrong. A reader got to 10% of chapter two; the server held
 * `scroll:2-act-i:15718`. Pressing "Continue Reading" opened chapter *one* at the top, and the
 * reader's first automatic save — issued with no user action at all — overwrote the row with
 * `scroll:1-dramatis-personae:0`, percent 0. Three reproductions, both entry points, and the
 * reading was simply gone.
 *
 * The chapter came from `chapterSlug`, which no client ever sends: the server derives it by
 * joining the progress row's `chapterId` to the chapters table. And `chapterId` was the chapter
 * named in the URL, while the locator was built from the chapter actually on screen — the mobile
 * reader appends chapters into one document as you scroll and never renavigates. So the row
 * disagreed with itself from the moment the reader crossed a chapter boundary, and the resume
 * rule believed the wrong half.
 *
 * This module fixes both halves, in the one place each belongs.
 */

/**
 * The chapter to reopen, given whatever was saved.
 *
 * The locator decides when it names a chapter that still exists — it is written from the chapter
 * on screen, so it is the half that tracks reality. `chapterSlug` is the fallback, for the cases
 * the locator cannot answer: a `page:<N>` locator on a chapterless PDF, a locator pointing at a
 * chapter that re-parsing has since renamed, or no locator at all.
 *
 * Returns null when nothing decides, so the caller can start at the beginning rather than guess.
 *
 * `chapters` is what the two candidates are checked against, and callers that have no list get the
 * ranking without the check — see the note in the body. Passing a list that has not loaded yet is
 * therefore the same as passing none: the answer arrives sooner and is corrected when the list does.
 */
export function resumeChapterSlug(
  chapterSlug: string | null | undefined,
  locator: string | null | undefined,
  chapters: readonly ChapterPageAnchor[] | null | undefined,
): string | null {
  const list = chapters ?? []
  // A reflow locator carries its own slug. It beats the stored chapter, which is a projection of
  // a field that stops moving once infinite scroll takes over.
  const fromLocator = parseScrollLocator(locator)?.slug

  // Not every caller has the chapter list. The library shelf and the "Continue Reading" rail work
  // from a progress row alone, and validating against a list they do not have would mean answering
  // "no idea" to a question the locator can answer perfectly well — which is how both of them ended
  // up trusting the *worse* half, unvalidated, while this function existed to prefer the better
  // one. With no list there is nothing to check a slug against, so the ranking is all there is.
  if (list.length === 0) return fromLocator ?? chapterSlug ?? null

  const exists = (slug: string | null | undefined): slug is string =>
    !!slug && list.some(c => c.slug === slug)

  if (exists(fromLocator)) return fromLocator

  if (exists(chapterSlug)) return chapterSlug

  // Chapterless PDF: the position is a page, and the chapter containing it is the best answer.
  return chapterSlugForPage(list, parsePdfPageLocator(locator))
}

/**
 * The chapter row a saved position belongs to.
 *
 * The write side of the same rule. A progress row stores a chapter id, and it must be the chapter
 * the locator names — otherwise the server derives a slug for a chapter the reader left long ago,
 * and every consumer of that slug is wrong in a way nothing on the row reveals.
 *
 * Returns null when the slug names no known chapter, so the caller can keep whatever id it had
 * rather than drop the write: a position saved against a slightly stale chapter is worth more
 * than a position not saved at all.
 */
export function chapterIdForSlug(
  chapters: readonly { id: string; slug: string | null }[] | null | undefined,
  slug: string | null | undefined,
): string | null {
  if (!slug) return null
  return chapters?.find(c => c.slug === slug)?.id ?? null
}
