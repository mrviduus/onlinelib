import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { useNativeLanguage } from '../context/NativeLanguageContext'
import { useVerticalSwipe } from '../hooks/useVerticalSwipe'
import { useDictionary } from '../hooks/useDictionary'
import { useReaderVocabulary } from '../hooks/useReaderVocabulary'
import { useTts } from '../hooks/useTts'
import { useTranslation } from '../hooks/useTranslation'
import { useBubbleTranslationSync } from '../hooks/useBubbleTranslationSync'
import { splitSentences, tokenizeWords } from '@textstack/shared'
import { getUserBookChapter, getUserBook } from '../api/userBooks'
import { updateWord as updateWordApi } from '../api/vocabulary'
import { normalizeVocabKey, vocabStageClass } from '../lib/vocabKey'
import { fetchWordBubble } from '../lib/wordBubbleFetch'
import { WordPopup } from '../components/reader/WordPopup'
import { SeoHead } from '../components/SeoHead'
import '../styles/focus-reader.css'

interface Props {
  mode?: 'public' | 'userbook'
}

// Client-side HTML → plain text. Kept inline (3 lines) rather than exporting
// from useInBookSearch to keep this page self-contained.
function htmlToText(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}

interface BubbleState {
  word: string
  translation: string | null
  translationLoading: boolean
  phonetic: string | undefined
  definition: string | null
  definitionLoading: boolean
  rect: DOMRect | null
}

export function FocusReaderPage({ mode = 'public' }: Props) {
  const { bookSlug, chapterSlug, id } = useParams<{
    bookSlug: string
    chapterSlug: string
    id: string
  }>()
  const api = useApi()
  const { language } = useLanguage()
  const { isAuthenticated } = useAuth()
  const { nativeLanguage, setNativeLanguage, hasConfirmedLanguage } = useNativeLanguage()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [html, setHtml] = useState<string>('')
  const [bookLanguage, setBookLanguage] = useState<string>('en')
  const [chapterId, setChapterId] = useState<string | null>(null)
  const [editionId, setEditionId] = useState<string | null>(null)
  const [bookTitle, setBookTitle] = useState<string>('')
  const [title, setTitle] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [bubble, setBubble] = useState<BubbleState | null>(null)
  const [pressingKey, setPressingKey] = useState<string | null>(null)

  const bubbleAbortRef = useRef<AbortController | null>(null)
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressOriginRef = useRef<{ x: number; y: number } | null>(null)

  // Only trust native language for translation when the user has explicitly
  // confirmed it — an auto-detected `navigator.language` guess shouldn't drive
  // translation fetches or poison SRS enrichment. Mirrors ReaderHighlights.
  const targetLang = hasConfirmedLanguage && bookLanguage !== nativeLanguage ? nativeLanguage : null

  // Shared services for the word popup
  const { lookup: lookupWord } = useDictionary()
  const { vocabMap, addWord, removeWord, updateTranslation } = useReaderVocabulary(bookLanguage, targetLang)

  // Backend translation patch + mid-popup lang-switch refetch + auto-save dedup.
  // Extracted hook — same shape is used in ReaderHighlights.
  const { triggerAutoSave, clearAutoSave } = useBubbleTranslationSync({
    bubble,
    setBubble,
    vocabMap,
    updateTranslation,
    targetLang,
    bookLanguage,
    abortRef: bubbleAbortRef,
  })
  const { speak } = useTts()
  const handleSpeak = useCallback((word: string) => {
    speak(word, bookLanguage)
  }, [speak, bookLanguage])

  // Container ref for WordPopup clamping (sentence area)
  const sentenceRef = useRef<HTMLDivElement>(null)

  const LONGPRESS_MS = 400
  const MOVE_TOLERANCE_PX = 8

  const cancelPress = useCallback(() => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
    pressOriginRef.current = null
    setPressingKey(null)
  }, [])

  // Theme: 'light' | 'dark' | 'system'. Persist in localStorage. Default system.
  type ThemePref = 'light' | 'dark' | 'system'
  const [themePref, setThemePref] = useState<ThemePref>(() => {
    if (typeof window === 'undefined') return 'system'
    const saved = localStorage.getItem('focus.theme')
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  })
  const cycleTheme = useCallback(() => {
    setThemePref((p) => {
      const next: ThemePref = p === 'system' ? 'light' : p === 'light' ? 'dark' : 'system'
      try { localStorage.setItem('focus.theme', next) } catch {}
      return next
    })
  }, [])
  const themeClass =
    themePref === 'light' ? ' focus-reader--light'
      : themePref === 'dark' ? ' focus-reader--dark'
      : ''

  // Fetch chapter
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        if (mode === 'public') {
          if (!bookSlug || !chapterSlug) return
          const [ch, bk] = await Promise.all([
            api.getChapter(bookSlug, chapterSlug),
            api.getBook(bookSlug),
          ])
          if (cancelled) return
          setHtml(ch.html)
          setChapterId(ch.id)
          setEditionId(bk.id)
          setTitle(ch.title)
          setBookTitle(bk.title)
          setBookLanguage(bk.language || 'en')
        } else {
          if (!id || !chapterSlug) return
          const [ch, book] = await Promise.all([
            getUserBookChapter(id, chapterSlug),
            getUserBook(id),
          ])
          if (cancelled) return
          setHtml(ch.html)
          setChapterId(ch.id)
          setEditionId(null) // userbook mode uses userBookId, not editionId
          setTitle(ch.title)
          setBookTitle(book.title || '')
          setBookLanguage(book.language || 'en')
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load chapter')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [mode, bookSlug, chapterSlug, id, api, language])

  // Split sentences from chapter html
  const sentences = useMemo(
    () => (html ? splitSentences(htmlToText(html), bookLanguage) : []),
    [html, bookLanguage],
  )

  // Restore/persist position per chapter
  const storageKey = chapterId ? `focus.${chapterId}.idx` : null
  useEffect(() => {
    if (!storageKey || sentences.length === 0) return
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const n = parseInt(saved, 10)
        if (Number.isFinite(n)) setCurrentIndex(Math.max(0, Math.min(n, sentences.length - 1)))
      }
    } catch {}
    // only once per chapter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, sentences.length])

  useEffect(() => {
    if (!storageKey) return
    try { localStorage.setItem(storageKey, String(currentIndex)) } catch {}
  }, [storageKey, currentIndex])

  // Close any open popup — shared by nav, exit, auto-dismiss
  const closeBubble = useCallback(() => {
    bubbleAbortRef.current?.abort()
    setBubble(null)
  }, [])

  // Nav handlers
  const next = useCallback(() => {
    closeBubble()
    setCurrentIndex((i) => Math.min(i + 1, Math.max(0, sentences.length - 1)))
  }, [sentences.length, closeBubble])
  const prev = useCallback(() => {
    closeBubble()
    setCurrentIndex((i) => Math.max(0, i - 1))
  }, [closeBubble])
  const exit = useCallback(() => {
    // Back to normal reader for the same chapter
    if (mode === 'public' && bookSlug && chapterSlug) {
      navigate(`/${language}/books/${bookSlug}/${chapterSlug}`)
    } else if (mode === 'userbook' && id && chapterSlug) {
      navigate(`/${language}/library/my/${id}/read/${chapterSlug}`)
    } else {
      navigate(-1)
    }
  }, [mode, bookSlug, chapterSlug, id, language, navigate])

  // Vertical swipe (touch)
  useVerticalSwipe({ onSwipeUp: next, onSwipeDown: prev, threshold: 50 })

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault(); next()
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault(); prev()
      } else if (e.key === 'Escape') {
        e.preventDefault(); exit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, exit])

  // Auto-save handler — fired from openWordBubble on every long-press (once per word).
  // Translation may be null at call time; translation-patch effect below forwards it
  // to the backend once fetchWordBubble resolves.
  const handleSaveWord = useCallback(async (word: string) => {
    // Never save vocab with an unconfirmed native (guess-poisons SRS). Throw so
    // triggerAutoSave's catch clears the dedup key — post-confirm re-tap retries.
    if (!hasConfirmedLanguage) {
      throw new Error('native_language_not_confirmed')
    }
    const currentTranslation = bubble?.word === word ? bubble?.translation : null
    const saved = await addWord({
      word,
      language: bookLanguage,
      editionId: mode === 'public' ? (editionId || undefined) : undefined,
      chapterId: mode === 'public' ? (chapterId || undefined) : undefined,
      userBookId: mode === 'userbook' ? (id || undefined) : undefined,
      bookTitle: bookTitle || undefined,
      // Send the confirmed native (not targetLang which is null in same-lang mode).
      nativeLanguage: nativeLanguage,
      translation: currentTranslation || null,
    }).catch(() => null)
    if (saved?.id && currentTranslation) {
      updateWordApi(saved.id, { translation: currentTranslation }).catch(() => {})
      updateTranslation(word, currentTranslation)
    }
  }, [addWord, bookLanguage, mode, editionId, chapterId, id, bookTitle, nativeLanguage, hasConfirmedLanguage, updateTranslation, bubble?.word, bubble?.translation])

  // Long-press a word → open full WordPopup (translation + definition + TTS).
  // Also auto-saves the word to vocab (fire-and-forget). Long-pressing the same
  // open word closes the popup (toggle-off).
  const openWordBubble = useCallback(
    (wordEl: HTMLElement, word: string) => {
      // Toggle off if same word is currently shown
      if (bubble?.word === word) {
        closeBubble()
        return
      }

      const rect = wordEl.getBoundingClientRect()
      bubbleAbortRef.current?.abort()
      const ctrl = new AbortController()
      bubbleAbortRef.current = ctrl

      setBubble({
        word,
        translation: null,
        translationLoading: !!targetLang,
        phonetic: undefined,
        definition: null,
        definitionLoading: true,
        rect,
      })
      fetchWordBubble({
        word, bookLanguage, targetLang,
        lookup: lookupWord, vocabMap, updateTranslation,
        signal: ctrl.signal,
        patch: (fields) => setBubble((prev) => (prev && prev.word === word ? { ...prev, ...fields } : prev)),
      })

      // Auto-save via shared dedup hook. Skip when native not confirmed —
      // save is deferred until user picks via WordPopup (see catch-up effect).
      if (hasConfirmedLanguage) {
        triggerAutoSave(word, () => handleSaveWord(word))
      }
    },
    [bubble?.word, closeBubble, bookLanguage, targetLang, lookupWord, vocabMap, updateTranslation, handleSaveWord, triggerAutoSave, hasConfirmedLanguage],
  )

  // Catch-up save: if the user long-pressed before confirming native, fire
  // the save once they confirm via WordPopup. Mirrors ReaderHighlights.
  const prevConfirmedRef = useRef(hasConfirmedLanguage)
  useEffect(() => {
    if (!prevConfirmedRef.current && hasConfirmedLanguage && bubble) {
      triggerAutoSave(bubble.word, () => handleSaveWord(bubble.word))
    }
    prevConfirmedRef.current = hasConfirmedLanguage
  }, [hasConfirmedLanguage, bubble, triggerAutoSave, handleSaveWord])

  // Translation patch + mid-popup lang-switch refetch live in useBubbleTranslationSync.

  // Abort in-flight + pending press on unmount
  useEffect(() => () => {
    bubbleAbortRef.current?.abort()
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
  }, [])

  // Auth check for userbook mode
  if (mode === 'userbook' && !isAuthenticated) {
    return (
      <div className="focus-reader">
        <SeoHead title="Focus" noindex />
        <div className="focus-reader__sentence">
          Sign in to read your uploaded books.&nbsp;
          <Link to={`/${language}/library`}>Back to Library</Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={`focus-reader${themeClass}`}>
        <SeoHead title="Focus" noindex />
        <div className="focus-reader__sentence" />
      </div>
    )
  }

  if (error || !sentences.length) {
    return (
      <div className={`focus-reader${themeClass}`}>
        <SeoHead title="Focus" noindex />
        <div className="focus-reader__sentence">
          {error || 'No readable content.'}
        </div>
      </div>
    )
  }

  const clampedIdx = Math.min(currentIndex, sentences.length - 1)
  const currentSentence = sentences[clampedIdx]
  const tokens = tokenizeWords(currentSentence)
  const progress = ((clampedIdx + 1) / sentences.length) * 100

  const vocabEntry = bubble ? vocabMap.get(normalizeVocabKey(bubble.word)) : undefined

  return (
    <div className={`focus-reader${themeClass}`}>
      <SeoHead title={title ? `${title} — Focus` : 'Focus'} noindex />
      <button
        className="focus-reader__btn focus-reader__theme"
        onClick={cycleTheme}
        aria-label={`Theme: ${themePref}`}
        title={`Theme: ${themePref} (click to cycle)`}
      >
        {themePref === 'light' ? (
          // sun
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        ) : themePref === 'dark' ? (
          // moon
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
          </svg>
        ) : (
          // half-circle (system)
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3v18" />
            <path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" stroke="none" />
          </svg>
        )}
      </button>
      <button
        className="focus-reader__btn focus-reader__exit"
        onClick={exit}
        aria-label="Exit focus mode"
        title="Exit focus mode (Esc)"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>
      <div className="focus-reader__sentence" aria-live="polite" ref={sentenceRef}>
        {tokens.map((t, i) => {
          const k = `${clampedIdx}:${i}`
          const active = bubble?.word === t.word
          const pressing = pressingKey === k
          const savedEntry = vocabMap.get(normalizeVocabKey(t.word))
          const savedClass = savedEntry
            ? ` focus-reader__word--saved vocab-underline ${vocabStageClass(savedEntry.stage)}`
            : ''
          const handlePointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
            // Only main pointer; ignore right-clicks on desktop
            if (e.pointerType === 'mouse' && e.button !== 0) return
            e.currentTarget.setPointerCapture?.(e.pointerId)
            pressOriginRef.current = { x: e.clientX, y: e.clientY }
            setPressingKey(k)
            const wordEl = e.currentTarget
            pressTimerRef.current = setTimeout(() => {
              pressTimerRef.current = null
              openWordBubble(wordEl, t.word)
              setPressingKey(null)
            }, LONGPRESS_MS)
          }
          const handlePointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
            if (!pressOriginRef.current) return
            const dx = e.clientX - pressOriginRef.current.x
            const dy = e.clientY - pressOriginRef.current.y
            if (Math.abs(dx) + Math.abs(dy) > MOVE_TOLERANCE_PX) cancelPress()
          }
          return (
            <span key={k}>
              <span className="focus-reader__word-wrap">
                <span
                  className={`focus-reader__word${active ? ' focus-reader__word--active' : ''}${pressing ? ' focus-reader__word--pressing' : ''}${savedClass}`}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={cancelPress}
                  onPointerCancel={cancelPress}
                  onPointerLeave={cancelPress}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {t.word}
                </span>
              </span>
              {t.trailing}
            </span>
          )
        })}
      </div>
      <div className="focus-reader__counter">
        {clampedIdx + 1} / {sentences.length}
      </div>
      <div className="focus-reader__progress-row">
        <span className="focus-reader__percent">{Math.round(progress)}%</span>
        <div className="focus-reader__progress-track">
          <div className="focus-reader__progress" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {bubble && (
        <WordPopup
          word={bubble.word}
          phonetic={bubble.phonetic}
          translation={bubble.translation}
          translationLoading={bubble.translationLoading}
          definition={bubble.definition}
          definitionLoading={bubble.definitionLoading}
          rect={bubble.rect}
          containerRef={sentenceRef}
          onSpeak={() => handleSpeak(bubble.word)}
          onRemove={vocabEntry?.id ? () => {
            removeWord(vocabEntry.id!, bubble.word)
            clearAutoSave(bubble.word)
            closeBubble()
          } : undefined}
          onClose={closeBubble}
          isSaved={!!vocabEntry}
          nativeLanguage={nativeLanguage}
          onChangeNativeLanguage={setNativeLanguage}
          hasConfirmedLanguage={hasConfirmedLanguage}
          bookLanguage={bookLanguage}
          t={t}
        />
      )}
    </div>
  )
}
