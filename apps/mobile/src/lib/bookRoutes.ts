import type { ContinueReadingPick, LibraryShelfItem } from '@textstack/shared'

/**
 * Route for a library shelf item.
 *
 * Shared by `LibraryShelf` and the per-shelf "view all" screen — the two used
 * to carry byte-identical copies, and both copies sent catalog items to
 * `/books/{slug}`. That route does not exist: `app/books.tsx` is the plural
 * *list* (`/books`), the detail screen is `app/book/[slug].tsx`. Every catalog
 * item in every shelf was a dead tap into `+not-found`.
 */
export function shelfItemRoute(it: LibraryShelfItem): string {
  if (it.type === 'userbook') return `/my-books/${it.id}`
  return `/book/${it.slug ?? ''}`
}

/**
 * Deep link that resumes a book at the chapter the reader last had open.
 *
 * Falls back to the detail screen when there is no chapter to resume into —
 * a book saved but never opened. Note the user-book segment order:
 * `/my-books/read/{bookId}/{chapterSlug}`. Getting those two backwards once
 * made Continue Reading look broken for every uploaded book.
 */
export function resumeRoute(pick: ContinueReadingPick): string {
  if (pick.type === 'edition') {
    return pick.chapterSlug ? `/reader/${pick.slug}/${pick.chapterSlug}` : `/book/${pick.slug}`
  }
  return pick.chapterSlug ? `/my-books/read/${pick.id}/${pick.chapterSlug}` : `/my-books/${pick.id}`
}
