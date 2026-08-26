import { isPdfAnchor, findAnchorOffset, ANCHOR_CONTEXT_LENGTH } from '@textstack/shared'
import type { TextAnchor, HighlightAnchor } from './offlineDb'

// The matching itself — the context ladder, the disambiguation and the fuzzy
// fallback — lives in @textstack/shared so mobile resolves anchors the same way.
// This file keeps the parts that need a document: reading text out of the DOM,
// and turning an offset back into a Range.
const CONTEXT_LENGTH = ANCHOR_CONTEXT_LENGTH

// Decorative inline content added by the reader (legacy VocabWordLayer
// appends <span.vocab-inline-translation> inside vocab <mark>). Range text
// extraction includes it, which pollutes anchor prefix/exact/suffix and
// breaks later lookup. Skip these when walking for text.
const EXCLUDE_SELECTOR = '.vocab-inline-translation, [data-vocab-overlay="true"]'

function isExcluded(node: Node): boolean {
  let el: Node | null = node
  while (el && el.nodeType !== Node.ELEMENT_NODE) el = el.parentNode
  if (!el) return false
  return !!(el as Element).closest?.(EXCLUDE_SELECTOR)
}

// Walk text nodes between two boundary (node, offset) pairs — in document
// order — and emit their text, skipping nodes beneath EXCLUDE_SELECTOR.
// If `endNode`/`endOffset` is null, runs until the scope ends.
function extractText(
  scope: Node,
  startNode: Node,
  startOffset: number,
  endNode: Node | null,
  endOffset: number | null,
): string {
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT)
  let out = ''
  let started = startNode === scope && startOffset === 0
  // Find the start text node.
  let node: Node | null = walker.nextNode()
  // If startNode is itself a text node, walker must reach it first.
  while (node) {
    const tn = node as Text
    const inStart = node === startNode
    const inEnd = node === endNode
    if (!started) {
      if (inStart) {
        started = true
        const upper = inEnd && endOffset !== null ? endOffset : tn.length
        if (!isExcluded(tn)) out += tn.data.slice(startOffset, upper)
        if (inEnd) return out
      }
    } else {
      if (inEnd && endOffset !== null) {
        if (!isExcluded(tn)) out += tn.data.slice(0, endOffset)
        return out
      }
      if (!isExcluded(tn)) out += tn.data
    }
    node = walker.nextNode()
  }
  return out
}

// Walk up from `node` to find the nearest ancestor with [data-chapter-id].
// Returns null if there is no chapter wrapper — callers fall back to the
// passed-in container (legacy single-chapter readers, tests).
function findChapterScope(node: Node | null, boundary: HTMLElement): HTMLElement | null {
  let current: Node | null = node
  while (current && current !== boundary) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const el = current as HTMLElement
      if (el.dataset && el.dataset.chapterId) return el
    }
    current = current.parentNode
  }
  return null
}

function chapterScopes(container: HTMLElement): HTMLElement[] {
  const list = container.querySelectorAll<HTMLElement>('[data-chapter-id]')
  return list.length > 0 ? Array.from(list) : [container]
}

/**
 * Create a TextAnchor from a Range in the DOM.
 * Offsets are relative to the nearest [data-chapter-id] ancestor of the
 * selection — so chapter eviction/remount elsewhere in the scroll container
 * does not invalidate them.
 */
export function createTextAnchor(
  range: Range,
  chapterId: string,
  container: HTMLElement
): TextAnchor {
  const scope = findChapterScope(range.startContainer, container) ?? container

  const beforeText = extractText(scope, scope, 0, range.startContainer, range.startOffset)
  const exact = extractText(scope, range.startContainer, range.startOffset, range.endContainer, range.endOffset)
  const afterText = extractText(scope, range.endContainer, range.endOffset, null, null)

  const prefix = beforeText.slice(-CONTEXT_LENGTH)
  const suffix = afterText.slice(0, CONTEXT_LENGTH)

  const startOffset = beforeText.length
  const endOffset = startOffset + exact.length

  return {
    prefix,
    exact,
    suffix,
    startOffset,
    endOffset,
    chapterId,
  }
}

/**
 * Find text in container using the anchor.
 * When the container holds multiple chapter wrappers, search each scope
 * independently — offsets were stored chapter-relative, so a cross-chapter
 * search would match at the wrong absolute offset.
 */
export function findTextByAnchor(
  anchor: HighlightAnchor,
  container: HTMLElement
): Range | null {
  // PDF (quad-rect) anchors can't be re-located by text over a pdf.js text
  // layer — they're painted from stored rects, never re-anchored via `exact`.
  // Guard so reflow consumers skip them instead of fuzzy-matching the display
  // text into the wrong place.
  if (isPdfAnchor(anchor)) return null
  for (const scope of chapterScopes(container)) {
    const range = findTextInScope(anchor, scope)
    if (range) return range
  }
  return null
}

function findTextInScope(anchor: TextAnchor, scope: HTMLElement): Range | null {
  // Filtered — matches the filtering applied in createTextAnchor so offsets
  // align even when excluded decorative spans (vocab translations) sit
  // inside the text.
  const fullText = extractText(scope, scope, 0, null, null)
  const offset = findAnchorOffset(fullText, anchor)
  if (offset === null) return null
  return createRangeAtOffset(scope, offset, anchor.exact.length)
}

/**
 * Create a Range at a specific text offset in container
 */
function createRangeAtOffset(
  container: HTMLElement,
  startOffset: number,
  length: number
): Range | null {
  const range = document.createRange()
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)

  let currentOffset = 0
  let startNode: Text | null = null
  let startNodeOffset = 0
  let endNode: Text | null = null
  let endNodeOffset = 0

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    // Skip decorative descendants so offsets match extractText.
    if (isExcluded(node)) continue
    const nodeLength = node.length

    if (startNode === null && currentOffset + nodeLength > startOffset) {
      startNode = node
      startNodeOffset = startOffset - currentOffset
    }

    if (startNode !== null && currentOffset + nodeLength >= startOffset + length) {
      endNode = node
      endNodeOffset = startOffset + length - currentOffset
      break
    }

    currentOffset += nodeLength
  }

  if (startNode && endNode) {
    try {
      range.setStart(startNode, startNodeOffset)
      range.setEnd(endNode, endNodeOffset)
      return range
    } catch {
      return null
    }
  }

  return null
}

/**
 * Simple string similarity (Dice coefficient)
 */

/**
 * Get the bounding rectangles for a highlight anchor
 */
export function getHighlightRects(
  anchor: HighlightAnchor,
  container: HTMLElement
): DOMRect[] {
  const range = findTextByAnchor(anchor, container)
  if (!range) return []

  return Array.from(range.getClientRects())
}
