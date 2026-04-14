import { useEffect } from 'react'
import type { VocabMap } from '../../hooks/useReaderVocabulary'
import { tokenizeVocabWords, normalizeVocabKey } from '../../lib/vocabKey'

interface VocabWordLayerProps {
  containerRef: React.RefObject<HTMLElement | null>
  vocabMap: VocabMap
  showInlineTranslations?: boolean
}

const STAGE_CLASSES: Record<number, string> = {
  0: 'vocab-underline--new',
  1: 'vocab-underline--recognition',
  2: 'vocab-underline--recall',
  3: 'vocab-underline--context',
  4: 'vocab-underline--mastered',
}

const MARK_ATTR = 'data-vocab-mark'

export function VocabWordLayer({ containerRef, vocabMap, showInlineTranslations = false }: VocabWordLayerProps) {
  useEffect(() => {
    const container = containerRef.current
    if (!container || vocabMap.size === 0) return

    // Debounce to avoid marking during rapid DOM changes
    const timer = setTimeout(() => markWords(container, vocabMap, showInlineTranslations), 150)

    return () => {
      clearTimeout(timer)
      // Clean up marks on unmount or vocab change
      removeMarks(container)
    }
  }, [containerRef, vocabMap, showInlineTranslations])

  return null
}

function removeMarks(container: HTMLElement) {
  const marks = container.querySelectorAll(`mark[${MARK_ATTR}]`)
  marks.forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    // Get only the word text (first child text node), not the translation span
    const wordText = mark.firstChild?.nodeType === Node.TEXT_NODE ? mark.firstChild.textContent : mark.textContent
    parent.replaceChild(document.createTextNode(wordText || ''), mark)
    parent.normalize()
  })
}

function markWords(container: HTMLElement, vocabMap: VocabMap, showInlineTranslations: boolean) {
  // First remove existing marks
  removeMarks(container)

  // Walk all text nodes
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip nodes inside mark elements (our own or highlights)
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (parent.tagName === 'MARK' || parent.closest(`mark[${MARK_ATTR}]`)) {
        return NodeFilter.FILTER_REJECT
      }
      // Skip script/style
      if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const textNodes: Text[] = []
  let node: Node | null
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text)
  }

  // Process each text node
  for (const textNode of textNodes) {
    const text = textNode.textContent || ''
    if (!text.trim()) continue

    const tokens = tokenizeVocabWords(text)
    const matchedTokens = tokens.filter((t) => vocabMap.has(normalizeVocabKey(t.word)))
    if (matchedTokens.length === 0) continue

    // Build replacement fragment
    const frag = document.createDocumentFragment()
    let lastEnd = 0

    for (const token of matchedTokens) {
      // Text before this token
      if (token.start > lastEnd) {
        frag.appendChild(document.createTextNode(text.slice(lastEnd, token.start)))
      }

      const entry = vocabMap.get(normalizeVocabKey(token.word))!
      const mark = document.createElement('mark')
      mark.setAttribute(MARK_ATTR, 'true')
      mark.className = `vocab-underline ${STAGE_CLASSES[entry.stage] || STAGE_CLASSES[0]}`
      mark.textContent = text.slice(token.start, token.end)

      // Translation positioned absolutely inside mark — no text reflow
      if (showInlineTranslations && entry.translation) {
        const span = document.createElement('span')
        span.className = 'vocab-inline-translation'
        span.textContent = entry.translation
        span.setAttribute('aria-hidden', 'true')
        mark.appendChild(span)
      }

      frag.appendChild(mark)

      lastEnd = token.end
    }

    // Remaining text
    if (lastEnd < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastEnd)))
    }

    textNode.parentNode?.replaceChild(frag, textNode)
  }
}
