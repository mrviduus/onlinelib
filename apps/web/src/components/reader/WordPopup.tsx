import { useEffect, useRef, useState } from 'react'
import { SpeakButton } from '../vocabulary/SpeakButton'

interface WordPopupProps {
  word: string
  phonetic?: string
  translation: string | null
  translationLoading: boolean
  definition: string | null
  definitionLoading: boolean
  rect: DOMRect | null
  containerRef: React.RefObject<HTMLElement | null>
  onSpeak: () => void
  onMarkKnown?: () => void
  onRemove?: () => void
  onClose: () => void
  vocabStage: number | null
  t: (key: string) => string
}

export function WordPopup({
  word,
  phonetic,
  translation,
  translationLoading,
  definition,
  definitionLoading,
  rect,
  containerRef,
  onSpeak,
  onMarkKnown,
  onRemove,
  onClose,
  vocabStage,
  t,
}: WordPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  // Position popup relative to word rect
  useEffect(() => {
    if (!rect || !containerRef.current || !popupRef.current) {
      setPosition(null)
      return
    }

    const container = containerRef.current
    const containerRect = container.getBoundingClientRect()
    const popup = popupRef.current
    const popupRect = popup.getBoundingClientRect()

    let top = rect.bottom + 8
    let left = rect.left + rect.width / 2 - popupRect.width / 2

    // Clamp horizontally within container
    const minLeft = containerRect.left + 8
    const maxLeft = containerRect.right - popupRect.width - 8
    left = Math.max(minLeft, Math.min(left, maxLeft))

    // Flip above if no room below
    if (top + popupRect.height > window.innerHeight - 8) {
      top = rect.top - popupRect.height - 8
    }

    top = Math.max(8, Math.min(top, window.innerHeight - popupRect.height - 8))

    setPosition({ top, left })
  }, [rect, containerRef, translation, definition, translationLoading, definitionLoading])

  // Close on click outside
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  if (!rect) return null

  return (
    <div
      ref={popupRef}
      className="word-popup"
      style={{
        position: 'fixed',
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        visibility: position ? 'visible' : 'hidden',
      }}
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.preventDefault()}
    >
      <div className="word-popup__header">
        <span className="word-popup__word">{word}</span>
        {phonetic && (
          <span className="word-popup__phonetic">{phonetic}</span>
        )}
      </div>

      {/* Translation - primary content */}
      <div className="word-popup__translation">
        {translationLoading ? (
          <span className="word-popup__loading">{t('reader.wordPopup.loading')}</span>
        ) : translation ? (
          translation
        ) : null}
      </div>

      {/* Definition - secondary, async */}
      {(definitionLoading || definition) && (
        <div className="word-popup__definition">
          {definitionLoading ? (
            <span className="word-popup__loading">{t('reader.wordPopup.loading')}</span>
          ) : (
            definition
          )}
        </div>
      )}

      <div className="word-popup__actions">
        <SpeakButton onClick={onSpeak} size={16} />
        {onMarkKnown && vocabStage != null && vocabStage < 4 && (
          <button
            className="word-popup__btn word-popup__btn--known"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onMarkKnown}
          >
            {t('reader.wordPopup.known')}
          </button>
        )}
        {onRemove && (
          <button
            className="word-popup__btn word-popup__btn--ignore"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRemove}
          >
            {t('reader.wordPopup.ignore')}
          </button>
        )}
      </div>
    </div>
  )
}
