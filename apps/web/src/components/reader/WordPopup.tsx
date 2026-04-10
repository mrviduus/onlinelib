import { useEffect, useRef, useState, useCallback } from 'react'
import { SpeakButton } from '../vocabulary/SpeakButton'
import { NATIVE_LANGUAGES, getFlagUrl } from '../../context/NativeLanguageContext'

const AUTO_DISMISS_MS = 3000
const EXIT_DURATION_MS = 150

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
  nativeLanguage: string
  onChangeNativeLanguage: (code: string) => void
  bookLanguage: string
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
  nativeLanguage,
  onChangeNativeLanguage,
  bookLanguage,
  t,
}: WordPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [closing, setClosing] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const exitTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const animatedClose = useCallback(() => {
    if (closing) return
    setClosing(true)
    clearTimeout(dismissTimerRef.current)
    exitTimerRef.current = setTimeout(onClose, EXIT_DURATION_MS)
  }, [onClose, closing])

  // Reset closing state on new word
  useEffect(() => { setClosing(false) }, [word])
  useEffect(() => () => clearTimeout(exitTimerRef.current), [])

  const cancelAutoDismiss = useCallback(() => {
    clearTimeout(dismissTimerRef.current)
  }, [])

  const scheduleAutoDismiss = useCallback(() => {
    clearTimeout(dismissTimerRef.current)
    dismissTimerRef.current = setTimeout(animatedClose, AUTO_DISMISS_MS)
  }, [animatedClose])

  // Start auto-dismiss timer on open / word change
  useEffect(() => {
    scheduleAutoDismiss()
    return () => clearTimeout(dismissTimerRef.current)
  }, [word]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cancel auto-dismiss when lang picker is open
  useEffect(() => {
    if (showLangPicker) cancelAutoDismiss()
  }, [showLangPicker, cancelAutoDismiss])

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
  }, [rect, containerRef, translation, definition, translationLoading, definitionLoading, showLangPicker])

  // Close on click outside
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        animatedClose()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [animatedClose])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') animatedClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [animatedClose])

  if (!rect) return null

  const langLabel = NATIVE_LANGUAGES.find(l => l.code === nativeLanguage)?.label || nativeLanguage

  return (
    <div
      ref={popupRef}
      className={`word-popup${closing ? ' word-popup--closing' : ''}`}
      style={{
        position: 'fixed',
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        visibility: position ? 'visible' : 'hidden',
      }}
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.preventDefault()}
      onMouseEnter={cancelAutoDismiss}
      onPointerEnter={cancelAutoDismiss}
      onClick={cancelAutoDismiss}
      onFocus={cancelAutoDismiss}
    >
      <div className="word-popup__header">
        <span className="word-popup__word">{word}</span>
        {phonetic && (
          <span className="word-popup__phonetic">{phonetic}</span>
        )}
        <button
          className="word-popup__close"
          onClick={animatedClose}
          onMouseDown={(e) => e.preventDefault()}
          aria-label="Close"
        >
          ×
        </button>
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

      {/* Language footer */}
      <div className="word-popup__lang-footer">
        {nativeLanguage === bookLanguage ? (
          <>
            <span className="word-popup__lang-label">{t('reader.wordPopup.definitionMode')}</span>
            <button
              className="word-popup__lang-change"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowLangPicker(!showLangPicker)}
            >
              {t('reader.wordPopup.translateTo')}
            </button>
          </>
        ) : (
          <>
            <span className="word-popup__lang-label">
              {t('reader.wordPopup.translatingTo')} {langLabel}
            </span>
            <button
              className="word-popup__lang-change"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowLangPicker(!showLangPicker)}
            >
              {t('reader.wordPopup.change')}
            </button>
          </>
        )}
        {showLangPicker && (
          <div className="word-popup__lang-dropdown">
            {NATIVE_LANGUAGES.filter(l => l.code !== nativeLanguage).map(l => (
              <button
                key={l.code}
                className="word-popup__lang-option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChangeNativeLanguage(l.code)
                  setShowLangPicker(false)
                  scheduleAutoDismiss()
                }}
              >
                <img src={getFlagUrl(l.code)} alt="" width="16" height="12" />
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
