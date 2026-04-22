import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'

interface ExplanationPopupProps {
  word: string
  explanation: string | null
  isLoading: boolean
  error: string | null
  rect: DOMRect | null
  containerRef: React.RefObject<HTMLElement | null>
  onClose: () => void
}

export function ExplanationPopup({
  word,
  explanation,
  isLoading,
  error,
  rect,
  containerRef,
  onClose,
}: ExplanationPopupProps) {
  const { t } = useTranslation()
  const popupRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
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

    const minLeft = containerRect.left + 8
    const maxLeft = containerRect.right - popupRect.width - 8
    left = Math.max(minLeft, Math.min(left, maxLeft))

    if (top + popupRect.height > window.innerHeight - 8) {
      top = rect.top - popupRect.height - 8
    }
    top = Math.max(8, Math.min(top, window.innerHeight - popupRect.height - 8))

    setPosition({ top, left })
  }, [rect, containerRef, explanation, isLoading, error])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

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
      className="translation-popup"
      style={{
        position: 'fixed',
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        visibility: position ? 'visible' : 'hidden',
        touchAction: 'none',
        maxWidth: 420,
      }}
    >
      <div className="translation-popup__header">
        <span style={{ fontWeight: 600 }}>{t('reader.explanationPopup.title')}: {word}</span>
        <button
          className="translation-popup__close"
          onClick={onClose}
          aria-label={t('reader.explanationPopup.close')}
          style={{ marginLeft: 'auto' }}
        >
          ×
        </button>
      </div>

      <div className="translation-popup__result">
        {isLoading && (
          <div className="translation-popup__loading">
            <span className="translation-popup__spinner" />
            {t('reader.explanationPopup.loading')}
          </div>
        )}
        {error && <div className="translation-popup__error">{error}</div>}
        {explanation && !isLoading && !error && (
          <div className="translation-popup__translated">{explanation}</div>
        )}
      </div>
    </div>
  )
}
