import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { useNativeLanguage } from '../context/NativeLanguageContext'
import { useVerticalSwipe } from '../hooks/useVerticalSwipe'
import { splitSentences, tokenizeWords } from '@textstack/shared'
import { getUserBookChapter } from '../api/userBooks'
import { translate as translateApi } from '../api/translation'
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

interface TapState {
  key: string // "sentenceIdx:wordIdx"
  text: string | null
  loading: boolean
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
  const { nativeLanguage } = useNativeLanguage()
  const navigate = useNavigate()

  const [html, setHtml] = useState<string>('')
  const [bookLanguage, setBookLanguage] = useState<string>('en')
  const [chapterId, setChapterId] = useState<string | null>(null)
  const [title, setTitle] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [tap, setTap] = useState<TapState | null>(null)

  const abortRef = useRef<AbortController | null>(null)

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
          setTitle(ch.title)
          setBookLanguage(bk.language || 'en')
        } else {
          if (!id || !chapterSlug) return
          const ch = await getUserBookChapter(id, chapterSlug)
          if (cancelled) return
          setHtml(ch.html)
          setChapterId(ch.id)
          setTitle(ch.title)
          // User-book language not fetched here; default to UI language.
          setBookLanguage(language)
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

  // Nav handlers
  const next = useCallback(() => {
    setTap(null)
    setCurrentIndex((i) => Math.min(i + 1, Math.max(0, sentences.length - 1)))
  }, [sentences.length])
  const prev = useCallback(() => {
    setTap(null)
    setCurrentIndex((i) => Math.max(0, i - 1))
  }, [])
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

  // Tap a word → inline translation
  // Deps exclude `tap` to avoid callback churn + stale closures; toggle-off uses functional setter.
  const tapWord = useCallback(
    async (sentenceIdx: number, wordIdx: number, word: string) => {
      const key = `${sentenceIdx}:${wordIdx}`
      // Same-lang: silent no-op, but clear any prior tap so UI stays honest
      if (bookLanguage === nativeLanguage) {
        setTap(null)
        return
      }
      // Toggle off if tapping same word
      let toggledOff = false
      setTap((prev) => {
        if (prev?.key === key) { toggledOff = true; return null }
        return { key, text: null, loading: true }
      })
      if (toggledOff) {
        abortRef.current?.abort()
        return
      }
      // Cancel previous in-flight request
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      try {
        const res = await translateApi(word, bookLanguage, nativeLanguage, ctrl.signal)
        if (ctrl.signal.aborted) return
        setTap({ key, text: res.translatedText, loading: false })
      } catch (err) {
        if (ctrl.signal.aborted) return
        if ((err as { name?: string })?.name === 'AbortError') return
        setTap({ key, text: '—', loading: false })
      }
    },
    [bookLanguage, nativeLanguage],
  )

  // Abort in-flight on unmount
  useEffect(() => () => abortRef.current?.abort(), [])

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

  const sameLang = bookLanguage === nativeLanguage

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
      <div className="focus-reader__sentence" aria-live="polite">
        {tokens.map((t, i) => {
          const k = `${clampedIdx}:${i}`
          const active = tap?.key === k
          return (
            <span key={k}>
              <span className="focus-reader__word-wrap">
                <span
                  className={`focus-reader__word${active ? ' focus-reader__word--active' : ''}${sameLang ? ' focus-reader__word--disabled' : ''}`}
                  onClick={() => tapWord(clampedIdx, i, t.word)}
                >
                  {t.word}
                </span>
                {active && (tap?.loading ? (
                  <span className="focus-reader__translation">…</span>
                ) : tap?.text ? (
                  <span className="focus-reader__translation">{tap.text}</span>
                ) : null)}
              </span>
              {t.trailing}
            </span>
          )
        })}
      </div>
      <div className="focus-reader__progress" style={{ width: `${progress}%` }} />
      {sameLang && (
        <div className="focus-reader__same-lang-hint">
          Same language — tap translation disabled
        </div>
      )}
    </div>
  )
}
