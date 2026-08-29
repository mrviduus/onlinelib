/**
 * Whether the reader may write its position yet.
 *
 * A reader got to 10% of chapter two, pressed Continue, was sent back to chapter one — and the
 * app then overwrote their place with `scroll:1-dramatis-personae:0`, percent 0, without them
 * touching anything. The routing half of that is fixed separately; this is the half that did the
 * damage.
 *
 * The WebView posts a `progress` message on its own `load` event, before any restore has been
 * injected, carrying `scrollY: 0`. Nothing on the mobile reflow path stopped that reaching the
 * server: `saveProgress` checked `enabled`, `bookKey` and `chapterSlug`, none of which say
 * anything about whether the reader is where they chose to be. `restoredRef` existed and no
 * writer read it.
 *
 * Both other readers in this codebase already had this. The PDF viewer has `pdfPersistGate`
 * (`awaitingTarget → jumping → live`), written after the same class of bug. The web reader keeps
 * `restoredFor` as state — deliberately not a ref — so the save-on-open effect can re-run *after*
 * restore, with the comment that the offset must reflect the restored scroll "not a transient 0".
 * The mobile reflow reader was the one that never got it.
 *
 * Note what this is not: a rule against writing a smaller number. Going back is something readers
 * legitimately do, and `pdfPersistGate` argues that case at length. The rule is about *when*, not
 * about which way the number moved.
 */
export interface ReaderWriteGateInput {
  /** False when another viewer owns this book's position (Original-layout PDF). */
  enabled: boolean
  /** Null until the edition/book id resolves. */
  bookKey: string | null | undefined
  /** The chapter being read. */
  chapterSlug: string | null | undefined
  /**
   * The chapter whose restore has completed — including the "nothing saved, stay at the top" case,
   * which is a completed restore and must open the gate, or a book opened for the first time could
   * never be saved at all.
   */
  restoredFor: string | null
}

/**
 * A type predicate rather than a plain boolean, so the caller keeps the narrowing the inline
 * `if (!bookKey || !chapterSlug) return` used to give it. Otherwise extracting this check would
 * have cost a second, duplicate one immediately after it — and two copies of a guard is how the
 * two halves drift apart.
 */
export function canPersistPosition(
  input: ReaderWriteGateInput,
): input is ReaderWriteGateInput & { bookKey: string; chapterSlug: string } {
  const { enabled, bookKey, chapterSlug, restoredFor } = input
  if (!enabled || !bookKey || !chapterSlug) return false
  // Per chapter, not a single boolean: moving to the next chapter starts a new restore, and a
  // write in that window would persist the new chapter at offset 0.
  return restoredFor === chapterSlug
}
