/**
 * The one-line quote shown under a saved word.
 *
 * QA saved "goddess" from *"What goddess was provok'd…"* and the list showed
 * `goddess / …d the crimes relate;…` — a fragment from elsewhere in the
 * paragraph, not containing the word, with no translation. Two arithmetic bugs
 * and one either/or:
 *
 * 1. The old code allotted **35 characters on each side** of the match. At 12px
 *    on a phone row with `numberOfLines={1}`, thirty-five characters of prefix
 *    plus an ellipsis already fill the line — so the word itself, bolded and
 *    supposedly the point of the quote, was pushed off the right edge before it
 *    could render. The prefix has to be short enough that the match survives.
 *
 * 2. The stored "sentence" is not a sentence. `extractSentence` in readerBridge
 *    returns the first 500 characters of the block ancestor, so it is usually a
 *    whole paragraph, and a word saved from its third sentence sat far outside
 *    any 35-character window.
 *
 * 3. When the match could not be found at all the old code printed the raw
 *    paragraph head — a quote that does not contain the word it belongs to.
 *    Returning null lets the caller show the translation instead, which is
 *    always true.
 */

export interface ContextSnippet {
  before: string
  match: string
  after: string
}

/** Characters of lead-in. Short on purpose — see (1). */
export const SNIPPET_PREFIX_CHARS = 14
/** Total characters of context around the match. */
export const SNIPPET_TOTAL_CHARS = 56

export function buildContextSnippet(
  sentence: string | null | undefined,
  word: string | null | undefined,
  opts: { prefixChars?: number; totalChars?: number } = {},
): ContextSnippet | null {
  if (!sentence || !word) return null
  const prefixChars = opts.prefixChars ?? SNIPPET_PREFIX_CHARS
  const totalChars = opts.totalChars ?? SNIPPET_TOTAL_CHARS

  const idx = sentence.toLowerCase().indexOf(word.toLowerCase())
  if (idx === -1) return null

  const match = sentence.slice(idx, idx + word.length)
  const rawBefore = sentence.slice(0, idx)
  const rawAfter = sentence.slice(idx + word.length)

  // Fits whole — trimming here would add ellipses to a line that never needed
  // them, which is noise pretending to be information.
  if (sentence.length <= totalChars) return { before: rawBefore, match, after: rawAfter }

  let before = rawBefore
  if (before.length > prefixChars) {
    // Cut at a word boundary where one is close, so the quote does not start
    // mid-syllable.
    const cut = before.length - prefixChars
    const space = before.indexOf(' ', cut)
    before = '…' + before.slice(space !== -1 && space - cut <= 6 ? space + 1 : cut)
  }

  // Whatever the match and the lead-in did not use goes forward — reading
  // continues to the right, so that is where the useful context is.
  const afterBudget = Math.max(0, totalChars - before.length - match.length)
  let after = rawAfter
  if (after.length > afterBudget) {
    after = after.slice(0, afterBudget).replace(/\s+\S*$/, '') + '…'
  }

  return { before, match, after }
}
