/**
 * Detects a word at the given screen coordinates using caretRangeFromPoint.
 * Extracted from ClickToTranslate for reuse in WordPopup flow.
 */
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

  // Expand to word boundaries
  const wordRe = /[\p{L}\p{N}'-]/u
  let start = offset
  let end = offset

  while (start > 0 && wordRe.test(text[start - 1])) start--
  while (end < text.length && wordRe.test(text[end])) end++

  const word = text.slice(start, end).trim()
  if (!word || word.length < 2 || word.length > 50) return null

  const wordRange = document.createRange()
  wordRange.setStart(textNode, start)
  wordRange.setEnd(textNode, end)

  return { word, range: wordRange }
}
