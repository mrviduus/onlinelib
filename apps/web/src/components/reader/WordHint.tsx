import { useEffect, useRef } from 'react'

const WORD_MIN_LENGTH = 4

function findVisibleArticle(container: HTMLElement): HTMLElement {
  const articles = container.querySelectorAll('article')
  for (const article of articles) {
    const rect = article.getBoundingClientRect()
    // Article overlaps the viewport
    if (rect.bottom > 0 && rect.top < window.innerHeight) return article
  }
  return container.querySelector('article') || container
}

function findHintWord(container: HTMLElement): { node: Text; start: number; end: number } | null {
  const content = findVisibleArticle(container)
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
  const wordRegex = /[\p{L}]{4,}/u
  const containerRect = container.getBoundingClientRect()

  // Use viewport-intersected bounds so off-screen content in scroll mode is excluded
  const viewTop = Math.max(containerRect.top, 0)
  const viewBottom = Math.min(containerRect.bottom, window.innerHeight)
  const viewLeft = Math.max(containerRect.left, 0)
  const viewRight = Math.min(containerRect.right, window.innerWidth)

  let textNode: Text | null
  while ((textNode = walker.nextNode() as Text | null)) {
    const parent = textNode.parentElement
    if (!parent || parent.closest('mark, .word-popup, .selection-toolbar, .note-editor, hgroup, h1, h2, h3')) continue

    // Check visibility against visible bounds
    const range = document.createRange()
    range.selectNodeContents(textNode)
    const rect = range.getBoundingClientRect()
    range.detach()

    if (rect.width === 0 || rect.height === 0) continue
    if (rect.bottom < viewTop || rect.top > viewBottom) continue
    if (rect.right < viewLeft || rect.left > viewRight) continue

    const text = textNode.textContent || ''
    const match = wordRegex.exec(text)
    if (match && match[0].length >= WORD_MIN_LENGTH) {
      return { node: textNode, start: match.index, end: match.index + match[0].length }
    }
  }
  return null
}

interface WordHintProps {
  containerRef: React.RefObject<HTMLElement | null>
  active: boolean
  onDismiss: () => void
}

export function WordHint({ containerRef, active, onDismiss }: WordHintProps) {
  const markRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active || !containerRef.current) return

    // Small delay so reader content is fully rendered
    const timer = setTimeout(() => {
      if (!containerRef.current) return
      const target = findHintWord(containerRef.current)
      if (!target) {
        onDismiss()
        return
      }

      const range = document.createRange()
      range.setStart(target.node, target.start)
      range.setEnd(target.node, target.end)

      const mark = document.createElement('mark')
      mark.className = 'word-hint-pulse'
      mark.setAttribute('data-word-hint', 'true')
      range.surroundContents(mark)
      markRef.current = mark
    }, 300)

    return () => {
      clearTimeout(timer)
      // Cleanup: unwrap the mark element
      const mark = markRef.current
      if (mark && mark.parentNode) {
        const parent = mark.parentNode
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark)
        }
        parent.removeChild(mark)
        markRef.current = null
      }
    }
  }, [active, containerRef, onDismiss])

  return null
}
