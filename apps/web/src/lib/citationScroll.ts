import { findTextMatches } from '@textstack/reader-overlay'
import type { AskCitation } from '../api/ask'

const SNIPPET_MAX = 40
const SNIPPET_MIN = 12

/**
 * A short, distinctive prefix of a citation's preview, cut at a word boundary. Kept short so it's
 * likely to sit within a single DOM text node — `findTextMatches` matches within one node, and the
 * RAG offsets are into PlainText (not the rendered DOM), so we locate by text, not by offset.
 * Returns '' when there isn't enough to be distinctive.
 */
export function makeSnippet(preview: string): string {
  const text = preview.replace(/\s+/g, ' ').trim()
  if (text.length < SNIPPET_MIN) return ''
  if (text.length <= SNIPPET_MAX) return text
  const cut = text.slice(0, SNIPPET_MAX)
  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace >= SNIPPET_MIN ? cut.slice(0, lastSpace) : cut
}

/** True if the node sits inside a reader decoration (vocab gloss / overlay), not the book text. */
function isInsideDecoration(node: Node): boolean {
  let el: Element | null = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  while (el) {
    if (el.classList?.contains('vocab-inline-translation') || el.hasAttribute('data-vocab-overlay')) return true
    el = el.parentElement
  }
  return false
}

/**
 * First DOM Range matching the snippet within the container, skipping matches that land inside
 * reader decorations (vocab glosses / overlays) so we anchor on the actual book text. Null if none.
 */
export function findCitationRange(container: HTMLElement, snippet: string): Range | null {
  if (!snippet) return null
  for (const range of findTextMatches(container, snippet)) {
    if (!isInsideDecoration(range.startContainer)) return range
  }
  return null
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

/**
 * Document-Y target for the proportional fallback: position within the article by char fraction,
 * centered in the viewport. Pure — geometry is passed in.
 */
export function proportionalTop(
  charStart: number,
  textLength: number,
  articleTop: number,
  articleHeight: number,
  viewportH: number,
): number {
  const frac = clamp01(charStart / Math.max(1, textLength))
  return Math.max(0, articleTop + articleHeight * frac - viewportH / 2)
}

function scrollRangeToCenter(range: Range): void {
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return
  const top = window.scrollY + rect.top - window.innerHeight / 2 + rect.height / 2
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

const HIGHLIGHT_NAME = 'rag-citation'
const HIGHLIGHT_MS = 2400
let flashTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Briefly tint the cited passage so the reader can see what was cited, then fade. Uses the CSS
 * Custom Highlight API (no DOM mutation); a graceful no-op where it isn't supported.
 */
function flashHighlight(range: Range): void {
  const cssApi = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS
  const HighlightCtor = (globalThis as { Highlight?: new (r: Range) => unknown }).Highlight
  if (!cssApi?.highlights || !HighlightCtor) return
  try {
    cssApi.highlights.set(HIGHLIGHT_NAME, new HighlightCtor(range))
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => {
      cssApi.highlights?.delete(HIGHLIGHT_NAME)
      flashTimer = null
    }, HIGHLIGHT_MS)
  } catch {
    // Range detached or API quirk — highlighting is best-effort.
  }
}

/**
 * Scroll the reader to a citation: snippet-search the rendered DOM (exact when matched), else a
 * proportional scroll by the PlainText offset (lands in the right region).
 */
export function scrollToCitation(container: HTMLElement, citation: AskCitation): void {
  const range = findCitationRange(container, makeSnippet(citation.preview))
  if (range) {
    scrollRangeToCenter(range)
    flashHighlight(range)
    return
  }
  // Fallback: no exact match (snippet spans markup) — scroll to the offset's region. textLength
  // includes any overlay text, a small inflation that's immaterial for an approximate landing.
  const articleTop = container.getBoundingClientRect().top + window.scrollY
  const top = proportionalTop(
    citation.charStart,
    container.textContent?.length ?? 0,
    articleTop,
    container.offsetHeight,
    window.innerHeight,
  )
  window.scrollTo({ top, behavior: 'smooth' })
}
