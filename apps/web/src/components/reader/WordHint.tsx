import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'

const WORD_MIN_LENGTH = 4
const GHOST_HINT_KEY = 'ghost_hint_seen'
const AUTO_DISMISS_MS = 2500
const MIN_DELAY_MS = 800
const MAX_DELAY_MS = 1500

function findVisibleArticle(container: HTMLElement): HTMLElement {
  const articles = container.querySelectorAll('article')
  for (const article of articles) {
    const rect = article.getBoundingClientRect()
    if (rect.bottom > 0 && rect.top < window.innerHeight) return article
  }
  return container.querySelector('article') || container
}

function findHintWord(container: HTMLElement): { node: Text; start: number; end: number } | null {
  const content = findVisibleArticle(container)
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
  const wordRegex = /[\p{L}]{4,}/u
  const containerRect = container.getBoundingClientRect()

  const viewTop = Math.max(containerRect.top, 0)
  const viewBottom = Math.min(containerRect.bottom, window.innerHeight)
  const viewLeft = Math.max(containerRect.left, 0)
  const viewRight = Math.min(containerRect.right, window.innerWidth)

  let textNode: Text | null
  while ((textNode = walker.nextNode() as Text | null)) {
    const parent = textNode.parentElement
    if (!parent || parent.closest('mark, .word-popup, .selection-toolbar, .note-editor, hgroup, h1, h2, h3')) continue

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
}

export function WordHint({ containerRef }: WordHintProps) {
  const { t } = useTranslation()
  const markRef = useRef<HTMLElement | null>(null)
  const labelRef = useRef<HTMLElement | null>(null)
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(GHOST_HINT_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    if (dismissed || !containerRef.current) return

    const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)
    const showTimer = setTimeout(() => {
      if (!containerRef.current) return
      const target = findHintWord(containerRef.current)
      if (!target) {
        setDismissed(true)
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

      // Create floating label
      const label = document.createElement('div')
      label.className = 'word-hint-label'
      label.textContent = t('onboarding.ghostHintLabel') || 'Tap any word'
      mark.style.position = 'relative'
      mark.appendChild(label)
      labelRef.current = label
    }, delay)

    // Auto-dismiss after delay
    const dismissTimer = setTimeout(() => {
      cleanup()
      setDismissed(true)
      try { localStorage.setItem(GHOST_HINT_KEY, '1') } catch {}
    }, delay + AUTO_DISMISS_MS)

    // Dismiss on any interaction
    const handleInteraction = () => {
      cleanup()
      setDismissed(true)
      try { localStorage.setItem(GHOST_HINT_KEY, '1') } catch {}
    }

    document.addEventListener('mousedown', handleInteraction, { once: true })
    document.addEventListener('touchstart', handleInteraction, { once: true })

    function cleanup() {
      clearTimeout(showTimer)
      clearTimeout(dismissTimer)
      document.removeEventListener('mousedown', handleInteraction)
      document.removeEventListener('touchstart', handleInteraction)
      const label = labelRef.current
      if (label && label.parentNode) {
        label.parentNode.removeChild(label)
        labelRef.current = null
      }
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

    return cleanup
  }, [dismissed, containerRef, t])

  return null
}
