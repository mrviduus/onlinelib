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
 *
 * Shared rather than mobile-only since the highlight screens needed the same
 * treatment: a one-word highlight rendered as `"in"` on three surfaces, while
 * the surrounding text sat unread in its own anchor. See anchorContextSnippet.
 */

import type { TextAnchor } from '../reader/textAnchor'


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

  return trimAround(
    sentence.slice(0, idx),
    sentence.slice(idx, idx + word.length),
    sentence.slice(idx + word.length),
    prefixChars,
    totalChars,
  )
}

/**
 * The same one-line quote, for a passage whose surroundings are already known.
 *
 * A highlight stores a {prefix, exact, suffix} anchor with ~30 characters of the real page on each
 * side, so unlike a vocabulary word there is nothing to search for — the split has been done. Only
 * the trimming is shared, which is why that half is its own function.
 *
 * Returns null when there is no usable context: PDF-rect anchors and the old no-anchor fallback path
 * carry only `exact`, and a "quote" that is just the fragment again is the thing this exists to
 * avoid. Callers render the fragment alone in that case.
 *
 * Untrimmed by default. The stored context is already bounded at ANCHOR_CONTEXT_LENGTH per side, so a
 * highlight card — which has several lines to spend — should show all of it; only a caller squeezing
 * this onto one line needs budgets, and it passes them.
 */
export function anchorContextSnippet(
  anchorJson: string | null | undefined,
  selectedText: string | null | undefined,
  opts: { prefixChars?: number; totalChars?: number } = {},
): ContextSnippet | null {
  if (!anchorJson) return null

  let anchor: Partial<TextAnchor>
  try {
    anchor = JSON.parse(anchorJson) as Partial<TextAnchor>
  } catch {
    return null
  }

  return contextFromAnchor(anchor, selectedText, opts)
}

/** As {@link anchorContextSnippet}, for callers that already hold the parsed anchor. */
export function contextFromAnchor(
  anchor: Partial<TextAnchor> | null | undefined,
  selectedText: string | null | undefined,
  opts: { prefixChars?: number; totalChars?: number } = {},
): ContextSnippet | null {
  if (!anchor) return null

  const match = selectedText || anchor.exact
  if (!match) return null

  const before = anchor.prefix ?? ''
  const after = anchor.suffix ?? ''
  if (!before && !after) return null

  if (opts.totalChars == null) {
    return { before: dropPartialWordStart(before), match, after: dropPartialWordEnd(after) }
  }

  return trimAround(
    dropPartialWordStart(before),
    match,
    dropPartialWordEnd(after),
    opts.prefixChars ?? SNIPPET_PREFIX_CHARS,
    opts.totalChars,
  )
}

/**
 * An anchor's context is a raw 30-character window, so both ends usually land
 * inside a word. QA read the result off a highlight screen: "…f the weather,
 * with the signs **in** heaven and earth that fore-bo…" — the quote begins on
 * the tail of "of" and ends on the head of "forebode". The window is not
 * negotiable (both anchor creators must agree on its size, or a highlight made
 * on one client matches worse on the other), so the trimming happens at render.
 *
 * The leading run is always dropped, because nothing in the text says whether
 * "the" is the word "the" or the tail of "breathe". Losing one word of context
 * is invisible; starting a quote mid-word is not. Spacing next to the match is
 * preserved — that gap is real.
 */
function dropPartialWordStart(text: string): string {
  if (!text) return text
  // Already starts at a word: nothing was cut off its front.
  if (/^\s/.test(text)) return text.trimStart()
  const firstSpace = text.search(/\s/)
  // No space at all — the whole window is one word fragment, so there is no
  // honest way to show it.
  if (firstSpace === -1) return ''
  return text.slice(firstSpace + 1)
}

function dropPartialWordEnd(text: string): string {
  if (!text) return text
  if (/\s$/.test(text)) return text.trimEnd()
  const lastSpace = text.search(/\s\S*$/)
  if (lastSpace === -1) return ''
  return text.slice(0, lastSpace)
}

/** Fit before + match + after onto one line, cutting at word boundaries. */
function trimAround(
  rawBefore: string,
  match: string,
  rawAfter: string,
  prefixChars: number,
  totalChars: number,
): ContextSnippet {
  // Fits whole — trimming here would add ellipses to a line that never needed
  // them, which is noise pretending to be information.
  if (rawBefore.length + match.length + rawAfter.length <= totalChars) {
    return { before: rawBefore, match, after: rawAfter }
  }

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
