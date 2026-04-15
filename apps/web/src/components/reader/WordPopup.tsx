import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react'
import { SpeakButton } from '../vocabulary/SpeakButton'
import { getFlagUrl } from '../../context/NativeLanguageContext'
import { LANGUAGES, POPULAR_LANGUAGES, OTHER_LANGUAGES, getLanguage } from '../../data/languages'

const AUTO_DISMISS_MS_MIN = 3000
const AUTO_DISMISS_MS_MAX = 8000
const AUTO_DISMISS_MS_PER_WORD = 350  // L2-reader pace, ~170 wpm
const EXIT_DURATION_MS = 150

// CJK (Hiragana, Katakana, CJK Unified, Hangul) — spaceless scripts where each
// glyph carries ~word-level info. Counted as individual reading units so
// Chinese/Japanese/Korean translations aren't flattened to 1 word.
const CJK_RE = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g

// Scale dismiss timer to content length so a 16-word definition gets more
// read-time than a 1-word translation. Min 3s (short content), max 8s (don't
// keep popup open forever — user can always tap to extend).
function computeDismissMs(translation: string | null, definition: string | null): number {
  const text = `${translation ?? ''} ${definition ?? ''}`.trim()
  if (!text) return AUTO_DISMISS_MS_MIN
  const cjkChars = (text.match(CJK_RE) || []).length
  const nonCjk = text.replace(CJK_RE, ' ')
  const words = nonCjk.split(/\s+/).filter(Boolean).length
  const units = words + cjkChars
  return Math.min(AUTO_DISMISS_MS_MAX, Math.max(AUTO_DISMISS_MS_MIN, units * AUTO_DISMISS_MS_PER_WORD))
}

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

  // Reset closing state on new word OR new rect (same word re-tapped elsewhere).
  // Cancel any pending exit timer from a previous close — otherwise it fires 150ms
  // later on the NEW popup and unmounts it (re-tap glitch). Keying on rect too
  // catches same-word re-taps during the 150ms close animation.
  useEffect(() => {
    clearTimeout(exitTimerRef.current)
    setClosing(false)
  }, [word, rect])

  useEffect(() => () => {
    clearTimeout(exitTimerRef.current)
    clearTimeout(dismissTimerRef.current)
  }, [])

  const cancelAutoDismiss = useCallback(() => {
    clearTimeout(dismissTimerRef.current)
  }, [])

  const scheduleAutoDismiss = useCallback(() => {
    clearTimeout(dismissTimerRef.current)
    const ms = computeDismissMs(translation, definition)
    dismissTimerRef.current = setTimeout(animatedClose, ms)
  }, [animatedClose, translation, definition])

  // Start auto-dismiss timer on open / word change / same-word re-tap at new rect.
  // Keying on rect ensures re-tapping the same word restarts the timer — otherwise
  // the old timer (maybe about to fire) closes the popup right after the user re-engages.
  useEffect(() => {
    scheduleAutoDismiss()
    return () => clearTimeout(dismissTimerRef.current)
  }, [word, rect]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cancel auto-dismiss when lang picker is open + autofocus search.
  // On close: clear query AND resume auto-dismiss — otherwise toggling the
  // "Change" button to close the picker leaves the popup stuck open forever.
  const didMountRef = useRef(false)
  useEffect(() => {
    if (showLangPicker) {
      cancelAutoDismiss()
      setTimeout(() => searchInputRef.current?.focus(), 0)
    } else {
      setLangQuery('')
      if (didMountRef.current) scheduleAutoDismiss()
    }
    didMountRef.current = true
  }, [showLangPicker, cancelAutoDismiss, scheduleAutoDismiss])

  // Restart auto-dismiss when translation finishes loading. Without this, the
  // 3s timer scheduled at popup-open / lang-pick can fire BEFORE a slow
  // translation arrives — user sees the popup vanish just as the result lands.
  // Reset gives them a fresh 3s window from the moment the translation appears.
  // Also covers definition: if dictionary lookup is the slow one, same logic applies.
  const wasLoadingRef = useRef(false)
  useEffect(() => {
    const loading = translationLoading || definitionLoading
    if (wasLoadingRef.current && !loading) {
      scheduleAutoDismiss()
    }
    wasLoadingRef.current = loading
  }, [translationLoading, definitionLoading, scheduleAutoDismiss])

  // Position popup relative to word rect.
  // useLayoutEffect (not useEffect) so repositioning happens synchronously
  // before paint — otherwise content changes (translation arriving, lang picker
  // opening) cause a visible flash at the old position with new dimensions.
  // Skip while closing — re-positioning a fading popup causes visual jitter, especially
  // when async data (translation/definition) arrives mid-exit.
  useLayoutEffect(() => {
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

  // Close on Escape — but if lang picker is open, close that first. Native
  // listeners run regardless of React's preventDefault on synthetic events,
  // so the picker's input handler alone can't stop the popup from closing.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showLangPicker) {
        setShowLangPicker(false)
      } else {
        animatedClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [animatedClose, showLangPicker])

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
          aria-label={t('reader.wordPopup.close')}
        >
          ×
        </button>
      </div>

      {/* Translation - primary content. Skip entirely in same-language mode
         (translation null + not loading) to avoid empty div with CSS padding. */}
      {(translationLoading || translation) && (
        <div className="word-popup__translation">
          {translationLoading ? (
            <span className="word-popup__loading">{t('reader.wordPopup.loading')}</span>
          ) : (
            translation
          )}
        </div>
      )}

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
        {isSaved && onRemove && (
          <button
            className="word-popup__btn word-popup__btn--remove"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRemove}
            aria-label={t('reader.wordPopup.remove')}
          >
            <span className="material-icons-outlined word-popup__btn-icon" aria-hidden="true">delete_outline</span>
            {t('reader.wordPopup.remove')}
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
                  // Only select on Enter when the user typed a query — otherwise a
                  // bare Enter picks an arbitrary first language and silently
                  // changes the user's native language.
                  if (!filteredLangs) return
                  const first = filteredLangs[0]
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
                  <div className="word-popup__lang-empty">{t('reader.wordPopup.noResults') || 'No results'}</div>
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
                  <div className="word-popup__lang-section">{t('reader.wordPopup.popularLanguages')}</div>
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
                  <div className="word-popup__lang-section">{t('reader.wordPopup.allLanguages')}</div>
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
