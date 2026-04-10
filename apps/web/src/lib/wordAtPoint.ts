/**
 * Detects a word at the given screen coordinates using caretRangeFromPoint.
 * Handles words split across inline elements (e.g. <em>beg</em>inning).
 */

const WORD_RE = /[\p{L}\p{N}'-]/u
const INLINE_TAGS = new Set([
  'SPAN', 'EM', 'STRONG', 'I', 'B', 'U', 'A', 'MARK',
  'SUB', 'SUP', 'SMALL', 'ABBR', 'CODE', 'S', 'DEL', 'INS',
])

export function getWordAtPoint(x: number, y: number): { word: string; range: Range } | null {
  let range: Range | null = null

  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y)
  } else if ((document as any).caretPositionFromPoint) {
    const pos = (document as any).caretPositionFromPoint(x, y)
    if (pos?.offsetNode) {
      range = document.createRange()
      range.setStart(pos.offsetNode, pos.offset)
      range.collapse(true)
    }
  }

  if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return null

  const textNode = range.startContainer as Text
  const text = textNode.textContent || ''
  const offset = range.startOffset

  // Expand to word boundaries within this text node
  let start = offset
  let end = offset

  while (start > 0 && WORD_RE.test(text[start - 1])) start--
  while (end < text.length && WORD_RE.test(text[end])) end++

  if (start === end) return null

  let word = text.slice(start, end)
  let startNode: Text = textNode
  let startOffset = start
  let endNode: Text = textNode
  let endOffset = end

  // Expand backward across adjacent inline elements
  if (start === 0) {
    let prev = adjacentTextNode(textNode, 'backward')
    while (prev) {
      const pt = prev.textContent || ''
      let i = pt.length
      while (i > 0 && WORD_RE.test(pt[i - 1])) i--
      if (i === pt.length) break
      word = pt.slice(i) + word
      startNode = prev
      startOffset = i
      if (i > 0) break
      prev = adjacentTextNode(prev, 'backward')
    }
  }

  // Expand forward across adjacent inline elements
  if (end === text.length) {
    let next = adjacentTextNode(textNode, 'forward')
    while (next) {
      const nt = next.textContent || ''
      let i = 0
      while (i < nt.length && WORD_RE.test(nt[i])) i++
      if (i === 0) break
      word = word + nt.slice(0, i)
      endNode = next
      endOffset = i
      if (i < nt.length) break
      next = adjacentTextNode(next, 'forward')
    }
  }

  word = word.trim()
  if (!word || word.length < 2 || word.length > 50) return null

  const wordRange = document.createRange()
  wordRange.setStart(startNode, startOffset)
  wordRange.setEnd(endNode, endOffset)

  return { word, range: wordRange }
}

/** Walk to the adjacent text node through inline elements only. */
function adjacentTextNode(node: Node, dir: 'forward' | 'backward'): Text | null {
  const siblingKey = dir === 'forward' ? 'nextSibling' : 'previousSibling'
  const childKey = dir === 'forward' ? 'firstChild' : 'lastChild'

  let current: Node | null = node
  while (current) {
    const sibling = current[siblingKey]
    if (sibling) {
      if (sibling.nodeType === Node.TEXT_NODE) return sibling as Text
      if (sibling.nodeType === Node.ELEMENT_NODE && INLINE_TAGS.has((sibling as Element).tagName)) {
        const el = sibling as Element
        // Skip vocab marks and hidden elements (e.g. inline translations)
        if (el.hasAttribute('data-vocab-mark') || el.getAttribute('aria-hidden') === 'true') return null
        const edge = deepChild(sibling, childKey)
        if (edge?.nodeType === Node.TEXT_NODE) return edge as Text
      }
      return null
    }
    // Traverse up through inline parents only
    const parent: Node | null = current.parentNode
    if (!parent || parent.nodeType !== Node.ELEMENT_NODE) return null
    if (!INLINE_TAGS.has((parent as Element).tagName)) return null
    // Don't expand outside vocab marks — the mark wraps a complete word
    if ((parent as Element).hasAttribute('data-vocab-mark')) return null
    current = parent
  }
  return null
}

function deepChild(node: Node, key: 'firstChild' | 'lastChild'): Node | null {
  let n: Node | null = node
  while (n?.[key]) n = n[key]
  return n
}
