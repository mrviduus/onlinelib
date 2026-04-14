import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { SpeakButton } from '../vocabulary/SpeakButton'
import { getFlagUrl } from '../../context/NativeLanguageContext'
import { LANGUAGES, POPULAR_LANGUAGES, OTHER_LANGUAGES, getLanguage } from '../../data/languages'

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
  onSave?: () => void | Promise<void>
  onRemove?: () => void
  onClose: () => void
  isSaved: boolean
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
  onSave,
  onRemove,
  onClose,
  isSaved,
  nativeLanguage,
  onChangeNativeLanguage,
  bookLanguage,
  t,
}: WordPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [langQuery, setLangQuery] = useState('')
  const [closing, setClosing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const exitTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const filteredLangs = useMemo(() => {
    const q = langQuery.trim().toLowerCase()
    if (!q) return null
    return LANGUAGES.filter(
      (l) =>
        l.code !== nativeLanguage && (
          l.englishName.toLowerCase().includes(q) ||
          l.nativeName.toLowerCase().includes(q) ||
          l.code.toLowerCase().startsWith(q)
        ),
    )
  }, [langQuery, nativeLanguage])

  const animatedClose = useCallback(() => {
    if (closing) return
    setClosing(true)
    clearTimeout(dismissTimerRef.current)
    exitTimerRef.current = setTimeout(onClose, EXIT_DURATION_MS)
  }, [onClose, closing])

  // Reset closing state on new word. Also cancel any pending exit timer from a previous
  // close — otherwise it fires 150ms later on the NEW popup and unmounts it (re-tap glitch).
  useEffect(() => {
    clearTimeout(exitTimerRef.current)
    setClosing(false)
    setIsSaving(false)
  }, [word])

  // Flip isSaving off when parent confirms save (isSaved becomes true).
  useEffect(() => {
    if (isSaved) setIsSaving(false)
  }, [isSaved])
  useEffect(() => () => {
    clearTimeout(exitTimerRef.current)
    clearTimeout(dismissTimerRef.current)
  }, [])

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

  // Cancel auto-dismiss when lang picker is open + autofocus search
  useEffect(() => {
    if (showLangPicker) {
      cancelAutoDismiss()
      setTimeout(() => searchInputRef.current?.focus(), 0)
    } else {
      setLangQuery('')
    }
  }, [showLangPicker, cancelAutoDismiss])

  // Position popup relative to word rect.
  // Skip while closing — re-positioning a fading popup causes visual jitter, especially
  // when async data (translation/definition) arrives mid-exit.
  useEffect(() => {
    if (closing) return
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
  }, [rect, containerRef, translation, definition, translationLoading, definitionLoading, showLangPicker, closing])

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

  const langLabel = getLanguage(nativeLanguage)?.nativeName || nativeLanguage

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
        {isSaved ? (
          onRemove && (
            <button
              className="word-popup__btn word-popup__btn--remove"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onRemove}
              aria-label={t('reader.wordPopup.remove')}
            >
              <span className="material-icons-outlined word-popup__btn-icon">delete_outline</span>
              {t('reader.wordPopup.remove')}
            </button>
          )
        ) : (
          onSave && (
            <button
              className="word-popup__btn word-popup__btn--save"
              onMouseDown={(e) => e.preventDefault()}
              disabled={isSaving}
              onClick={async () => {
                if (isSaving) return
                setIsSaving(true)
                try {
                  await onSave()
                  // Smooth dismiss shortly after success — user sees Save→Remove swap briefly.
                  clearTimeout(dismissTimerRef.current)
                  dismissTimerRef.current = setTimeout(animatedClose, 700)
                } catch {
                  // Reset on failure so user can retry; otherwise stuck "Saving..."
                  setIsSaving(false)
                }
              }}
              aria-label={t('reader.wordPopup.save')}
            >
              <span className="material-icons-outlined word-popup__btn-icon">add</span>
              {isSaving ? t('reader.wordPopup.saving') : t('reader.wordPopup.save')}
            </button>
          )
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
            <input
              ref={searchInputRef}
              type="text"
              value={langQuery}
              onChange={(e) => setLangQuery(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setShowLangPicker(false)
                  scheduleAutoDismiss()
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  const list = filteredLangs ?? LANGUAGES.filter(l => l.code !== nativeLanguage)
                  const first = list[0]
                  if (first) {
                    onChangeNativeLanguage(first.code)
                    setShowLangPicker(false)
                    scheduleAutoDismiss()
                  }
                }
              }}
              placeholder={t('reader.wordPopup.searchLanguage') || 'Search language...'}
              className="word-popup__lang-search"
              autoComplete="off"
            />
            <div className="word-popup__lang-list">
              {filteredLangs ? (
                filteredLangs.length === 0 ? (
                  <div className="word-popup__lang-empty">No results</div>
                ) : (
                  filteredLangs.map((l) => (
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
                      <span className="word-popup__lang-native">{l.nativeName}</span>
                      {l.englishName !== l.nativeName && (
                        <span className="word-popup__lang-english">{l.englishName}</span>
                      )}
                    </button>
                  ))
                )
              ) : (
                <>
                  <div className="word-popup__lang-section">Popular</div>
                  {POPULAR_LANGUAGES.filter(l => l.code !== nativeLanguage).map((l) => (
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
                      <span className="word-popup__lang-native">{l.nativeName}</span>
                      {l.englishName !== l.nativeName && (
                        <span className="word-popup__lang-english">{l.englishName}</span>
                      )}
                    </button>
                  ))}
                  <div className="word-popup__lang-section">All languages</div>
                  {OTHER_LANGUAGES.filter(l => l.code !== nativeLanguage).map((l) => (
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
                      <span className="word-popup__lang-native">{l.nativeName}</span>
                      {l.englishName !== l.nativeName && (
                        <span className="word-popup__lang-english">{l.englishName}</span>
                      )}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
