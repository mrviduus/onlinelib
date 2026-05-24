/**
 * PII-safe pathname compression for analytics.
 *
 * Strips trailing identifiers (book slugs, chapter slugs, ids) before
 * sending to the analytics transport. Dashboards aggregate on the
 * shape (`/reader/edition` not `/reader/dracula/chapter-1`).
 *
 * Special-cased routes keep one extra segment when the discriminator
 * carries meaning. Today: `/my-books/read/...` keeps `/my-books/read`
 * so we can tell apart "user-book detail" from "user-book reader" —
 * critical for post-launch analysis of "app opens on random screens"
 * reports (we want to know if random opens land in reader vs browse).
 *
 * Pure, no I/O. Lives in `@textstack/shared` so any platform (web,
 * mobile, future surfaces) gets the same PII-stripping logic.
 */

/** Routes that should keep 3 path segments instead of the default 2.
 *  Each entry is the leading `<first>/<second>` pair. */
const THREE_SEGMENT_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  // /my-books/read/<id>/<slug>  → /my-books/read
  ['my-books', 'read'],
]

export function pathnamePrefix(p: string | null | undefined): string {
  if (typeof p !== 'string' || p.length === 0 || p === '/') return '/'
  const parts = p.split('/').filter(Boolean)
  if (parts.length === 0) return '/'

  for (const [first, second] of THREE_SEGMENT_PREFIXES) {
    if (parts[0] === first && parts[1] === second) {
      return `/${first}/${second}`
    }
  }

  return '/' + parts.slice(0, 2).join('/')
}
