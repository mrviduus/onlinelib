/**
 * What a screen shows when a load did not go the way it hoped.
 *
 * Three screens were taught this by hand and eight were not. `isOfflineError`
 * was called from two files in the whole repository; everywhere else a failed
 * fetch was caught, written to the console, and left as an empty array — so
 * Vocabulary told a reader with a saved word that they had none, and the book
 * screen showed a spinner forever. A QA pass named the mistake exactly: the fix
 * "was applied per screen rather than to a shared template."
 *
 * The decision is here, as a function, because it is the part that has to be the
 * same everywhere. Loading the data stays with the screen — Library reads three
 * endpoints and a SQLite cache, Discover reads three more and has nothing to
 * fall back on, and no hook should pretend those are one shape.
 */

export type LoadStatus = 'loading' | 'ready' | 'offline' | 'failed'

/**
 * `content` — render normally.
 * `banner` — render the data AND say it is partial or stale.
 * `empty`  — there is nothing to render; the screen is the message.
 */
export type LoadView = 'content' | 'banner' | 'empty'

export interface LoadViewInput {
  status: LoadStatus
  /** Whether the screen has anything worth showing — cached rows included. */
  hasData: boolean
}

export function resolveLoadView({ status, hasData }: LoadViewInput): LoadView {
  if (status === 'ready' || status === 'loading') return 'content'
  // A failure with something on screen is a caveat, not a wall. Library falls
  // back to downloaded books and must not throw them away to show an error.
  return hasData ? 'banner' : 'empty'
}

/**
 * Whether the empty state a screen renders is its own "you have nothing yet"
 * copy or an explanation of a failure.
 *
 * This is the distinction the eight screens could not make. `library.length ===
 * 0` was the whole condition, so "no books" and "no answer" produced the same
 * screen — the one written to welcome a new reader, shown to someone whose
 * twelve books had simply not arrived. Indistinguishable from losing an account.
 */
export function isFailureEmpty(status: LoadStatus, hasData: boolean): boolean {
  return !hasData && (status === 'offline' || status === 'failed')
}
