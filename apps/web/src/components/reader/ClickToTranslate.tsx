import { useState, useEffect, useCallback, useRef } from 'react'
import { translate as translateApi } from '../../api/translation'
import { useTranslation } from '../../hooks/useTranslation'

interface TranslatedWord {
  id: string
  word: string
  translation: string
  markEl: HTMLElement
  loading: boolean
}

interface ClickToTranslateProps {
  containerRef: React.RefObject<HTMLElement | null>
  sourceLang: string
  targetLang: string
  wrapperRef: React.RefObject<HTMLElement | null>
}

const HINT_KEY = 'textstack_click_translate_hint'

function getWordAtPoint(x: number, y: number): { word: string; range: Range } | null {
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

export function ClickToTranslate({ containerRef, sourceLang, targetLang, wrapperRef }: ClickToTranslateProps) {
  const [words, setWords] = useState<TranslatedWord[]>([])
  const [positions, setPositions] = useState<Map<string, { top: number; left: number }>>(new Map())
  const [showHint, setShowHint] = useState(() => {
    try { return !localStorage.getItem(HINT_KEY) } catch { return true }
  })
  const mouseDownRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const { t } = useTranslation()

  const dismissHint = useCallback(() => {
    setShowHint(false)
    try { localStorage.setItem(HINT_KEY, '1') } catch {}
  }, [])

  // Update label positions on scroll/resize
  const updatePositions = useCallback(() => {
    const map = new Map<string, { top: number; left: number }>()
    for (const w of words) {
      if (!w.markEl.isConnected) continue
      const rect = w.markEl.getBoundingClientRect()
      map.set(w.id, {
        top: rect.top - 20,
        left: rect.left + rect.width / 2,
      })
    }
    setPositions(map)
  }, [words])

  useEffect(() => {
    updatePositions()
    window.addEventListener('scroll', updatePositions, true)
    window.addEventListener('resize', updatePositions)
    return () => {
      window.removeEventListener('scroll', updatePositions, true)
      window.removeEventListener('resize', updatePositions)
    }
  }, [updatePositions])

  // Clean up marks on unmount or chapter change
  useEffect(() => {
    return () => {
      setWords((prev) => {
        for (const w of prev) unwrapMark(w.markEl)
        return []
      })
    }
  }, [])

  // Attach click detection to wrapper via native DOM events
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const onDown = (e: MouseEvent | TouchEvent) => {
      const pt = 'touches' in e ? e.touches[0] : e
      mouseDownRef.current = { x: pt.clientX, y: pt.clientY, time: Date.now() }
    }

    const onUp = (e: MouseEvent | TouchEvent) => {
      const pt = 'changedTouches' in e ? e.changedTouches[0] : e as MouseEvent
      handleWordClick(pt.clientX, pt.clientY, e.target as HTMLElement)
    }

    wrapper.addEventListener('mousedown', onDown)
    wrapper.addEventListener('mouseup', onUp)
    wrapper.addEventListener('touchstart', onDown, { passive: true })
    wrapper.addEventListener('touchend', onUp)

    return () => {
      wrapper.removeEventListener('mousedown', onDown)
      wrapper.removeEventListener('mouseup', onUp)
      wrapper.removeEventListener('touchstart', onDown)
      wrapper.removeEventListener('touchend', onUp)
    }
  }, [wrapperRef]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleWordClick = useCallback(
    (clientX: number, clientY: number, target: HTMLElement) => {
      const down = mouseDownRef.current
      mouseDownRef.current = null
      if (!down) return

      // Must be a quick click with minimal movement
      const dt = Date.now() - down.time
      const dx = Math.abs(clientX - down.x)
      const dy = Math.abs(clientY - down.y)
      if (dt > 300 || dx > 5 || dy > 5) return

      // Don't interfere with existing selection
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return

      const container = containerRef.current
      if (!container) return

      // If clicking on an already-translated mark, remove it
      if (target.classList?.contains('click-translate-word')) {
        const id = target.dataset.translateId
        if (id) {
          setWords((prev) => {
            const w = prev.find((x) => x.id === id)
            if (w) unwrapMark(w.markEl)
            return prev.filter((x) => x.id !== id)
          })
          return
        }
      }

      // Don't process clicks outside content
      if (!container.contains(target)) return

      const result = getWordAtPoint(clientX, clientY)
      if (!result) return

      // Check if word is inside an existing mark
      if (result.range.startContainer.parentElement?.closest('.click-translate-word')) return

      // Dismiss hint on first word click
      if (showHint) dismissHint()

      const id = `ctt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

      // Wrap word in <mark>
      const mark = document.createElement('mark')
      mark.className = 'click-translate-word'
      mark.dataset.translateId = id
      result.range.surroundContents(mark)

      const newWord: TranslatedWord = {
        id,
        word: result.word,
        translation: '',
        markEl: mark,
        loading: true,
      }

      setWords((prev) => [...prev, newWord])

      // Translate
      translateApi(result.word, sourceLang, targetLang)
        .then((res) => {
          setWords((prev) =>
            prev.map((w) =>
              w.id === id ? { ...w, translation: res.translatedText, loading: false } : w
            )
          )
        })
        .catch(() => {
          setWords((prev) =>
            prev.map((w) => (w.id === id ? { ...w, translation: '?', loading: false } : w))
          )
        })
    },
    [containerRef, sourceLang, targetLang, showHint, dismissHint]
  )

  return (
    <>
      {/* Hint banner */}
      {showHint && (
        <div className="click-translate-hint">
          <span>{t('reader.clickToTranslate')}</span>
          <button className="click-translate-hint__close" onClick={dismissHint}>
            ✕
          </button>
        </div>
      )}

      {/* Translation labels */}
      {words.map((w) => {
        const pos = positions.get(w.id)
        if (!pos) return null
        return (
          <div
            key={w.id}
            className="click-translate-label"
            style={{ top: pos.top, left: pos.left }}
          >
            {w.loading ? '...' : w.translation}
          </div>
        )
      })}
    </>
  )
}

function unwrapMark(mark: HTMLElement) {
  if (!mark.isConnected) return
  const parent = mark.parentNode
  if (!parent) return
  while (mark.firstChild) {
    parent.insertBefore(mark.firstChild, mark)
  }
  parent.removeChild(mark)
  parent.normalize()
}
