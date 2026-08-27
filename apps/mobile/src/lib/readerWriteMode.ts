/**
 * Which reader owns an uploaded book's reading position right now.
 *
 * A user book can be read two ways, and they store the position in different
 * coordinate spaces: the reflow reader writes `scroll:<chapterSlug>:<offset>`,
 * the Original-layout PDF viewer writes `page:<n>`. Only one of them is on
 * screen, and only that one has anything true to say.
 *
 * Nothing enforced that. `useReaderPersistence` was wired up with no notion of
 * mode, so its unmount flush wrote a reflow locator every time the reader
 * closed — including when the reader had been a PDF viewer the whole time and
 * the refs it reads had never been touched. QA read to page 16 of a PDF, left,
 * came back, left again, and the server held `scroll:2-the-mom-test:0` at 4%.
 *
 * It is one boolean, and it lives here rather than inline for two reasons: the
 * same expression has to reach both the persistence wiring and the renderer
 * (they disagreed, which is what made the bug possible), and `src/lib/**` is the
 * only place mobile vitest can see.
 */
export interface ReaderWriteModeInput {
  /** The book has an original PDF the viewer can render. */
  hasOriginalPdf: boolean
  /** The reader fell back to text because the PDF would not render. */
  forceReflow: boolean
}

/**
 * True when the reflow persistence path may write.
 *
 * Note the default for an unloaded book: `hasOriginalPdf` is false until the
 * book fetch lands, so this returns true early in the session. That is correct
 * — a reflow book is the common case, and the PDF path does not write until its
 * viewer is up either.
 */
export function reflowWritesEnabled({ hasOriginalPdf, forceReflow }: ReaderWriteModeInput): boolean {
  return !hasOriginalPdf || forceReflow
}
