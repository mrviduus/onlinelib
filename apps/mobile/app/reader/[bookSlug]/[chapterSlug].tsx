import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { createBooksApi, readingProgressApi, bookmarksApi, vocabularyApi, highlightsApi, translationApi, t } from '@textstack/shared'
import type { Chapter, BookmarkDto, ChapterSummary, PublicHighlight } from '@textstack/shared'
import { buildReaderHtml } from '../../../src/lib/readerHtml'
import { getCachedChapter, getAllCachedBooks } from '../../../src/lib/offlineDb'
import { saveLocalProgress } from '../../../src/lib/progressStorage'
import { useAuth } from '../../../src/context/AuthContext'
import { useReaderSettings } from '../../../src/hooks/useReaderSettings'
import { ReaderSettingsDrawer } from '../../../src/components/ReaderSettingsDrawer'
import { BookmarksSheet } from '../../../src/components/BookmarksSheet'
import { SelectionActionBar } from '../../../src/components/SelectionActionBar'
import { WordCard } from '../../../src/components/WordCard'
import { DictionarySheet } from '../../../src/components/DictionarySheet'
import { TranslationSheet } from '../../../src/components/TranslationSheet'
import { HighlightNoteModal } from '../../../src/components/HighlightNoteModal'
import { TocSheet } from '../../../src/components/TocSheet'
import { ReaderSearchBar } from '../../../src/components/ReaderSearchBar'
import { ReaderStatsWidget } from '../../../src/components/ReaderStatsWidget'
import { ReaderTapCoachmark } from '../../../src/components/reader/ReaderTapCoachmark'
import { useReadingSession } from '../../../src/hooks/useReadingSession'
import { useTts } from '../../../src/hooks/useTts'
import { useQuickStats } from '../../../src/hooks/useQuickStats'
import { useHaptics } from '../../../src/hooks/useHaptics'
import { useToast } from '../../../src/context/ToastContext'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../../src/context/ThemeContext'
import { useLanguage } from '../../../src/context/LanguageContext'
import { useNativeLanguage } from '../../../src/context/NativeLanguageContext'
import { fonts } from '../../../src/theme/typography'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { trackBookOpened, trackVocabSaved, trackTranslationUsed } from '../../../src/lib/analytics'

/** Extract chapterSlug from bookmark locator (format: "chapter:slug") */
function getSlugFromLocator(locator: string): string {
  return locator.startsWith('chapter:') ? locator.slice(8) : locator
}

/** Lightweight {key} interpolation — shared `t()` returns raw keys, we fill them in here. */
function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

export default function ReaderScreen() {
  const { bookSlug, chapterSlug } = useLocalSearchParams<{ bookSlug: string; chapterSlug: string }>()
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const { settings, update: updateSettings, resolvedFontFamily, resolvedTheme } = useReaderSettings()
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [loading, setLoading] = useState(true)
  /**
   * Non-null when we have nothing to render: either no cached copy and the
   * network failed (`'offline'`), or the server says the chapter is gone
   * (`'notfound'`). Used to replace the eternal spinner with a real
   * empty-state (R-4).
   */
  const [chapterError, setChapterError] = useState<'offline' | 'notfound' | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [bookmarks, setBookmarks] = useState<BookmarkDto[]>([])
  // `selectionId` increments per selection *event* (even when the user taps
  // the same word twice). WordCard uses it as a useEffect dep so the
  // auto-dismiss timer resets on each re-select (B-12) — and we use it at
  // the parent to toggle dismiss when the same word is re-tapped.
  const [selection, setSelection] = useState<
    { text: string; sentence: string; anchor?: any; selectionId: number } | null
  >(null)
  const selectionIdRef = useRef(0)
  useEffect(() => {
    if (__DEV__) console.log('[diag] selection STATE:', selection?.text ?? 'null', 'id=', selection?.selectionId)
  }, [selection])
  const [wordSaved, setWordSaved] = useState(false)
  /**
   * F1 anti-spiral state: when the backend classifies a tapped word as
   * `lookup` / `lookup_pending` (top-15k but not top-5k, or rare), we keep
   * the id + tapsRemaining here so the WordCard can render a
   * `RareWordNotice` with the "Add anyway" escalation path.
   */
  const [lookupState, setLookupState] = useState<
    { kind: 'lookup' | 'lookup_pending'; id: string; tapsRemaining: number | null; busy: boolean } | null
  >(null)
  // In-flight / already-attempted auto-saves. Guards against rapid re-taps
  // firing the API twice before vocabMapRef catches up (web does the same
  // via `useBubbleTranslationSync`). Cleared on error so retry still works.
  const autoSavedRef = useRef<Set<string>>(new Set())
  const [sessionWordCount, setSessionWordCount] = useState(0)
  const [exitSummary, setExitSummary] = useState(false)
  const [dictOpen, setDictOpen] = useState(false)
  const [translateOpen, setTranslateOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchMatchCount, setSearchMatchCount] = useState(0)
  const [searchCurrentMatch, setSearchCurrentMatch] = useState(0)
  // Cross-platform edit-note sheet for tapped highlights. Replaces the
  // iOS-only `Alert.prompt` which silently did nothing on Android (B-02).
  const [editingHighlight, setEditingHighlight] = useState<PublicHighlight | null>(null)
  const [chapters, setChapters] = useState<ChapterSummary[]>([])
  const [progress, setProgress] = useState(0)
  const [bookTitle, setBookTitle] = useState('')
  const { toggle: toggleTts, isSpeaking } = useTts()
  const webViewRef = useRef<WebView>(null)
  const progressRef = useRef(0)
  const editionIdRef = useRef<string | null>(null)
  const bookTitleRef = useRef<string | null>(null)
  const wordCountRef = useRef(0)
  const highlightsRef = useRef<PublicHighlight[]>([])
  const totalWordCountRef = useRef(0)

  const { colors } = useTheme()
  const { language } = useLanguage()
  const { nativeLanguage } = useNativeLanguage()
  const quickStats = useQuickStats(isAuthenticated)
  const haptics = useHaptics()
  const { show: showToast } = useToast()
  const sessionWordCountRef = useRef(0)

  // Single source of truth for "word added" feedback — keeps toast copy + haptic
  // cue + session counter consistent across the two save paths (auto-save on
  // single-word tap, and the manual "Save" button in SelectionActionBar).
  const notifyWordSaved = useCallback(() => {
    sessionWordCountRef.current += 1
    const count = sessionWordCountRef.current
    haptics.play('complete')
    showToast({
      variant: 'success',
      message:
        count > 1
          ? interpolate(t(language, 'reader.toastWordAddedCount'), { count })
          : t(language, 'reader.toastWordAdded'),
      actionLabel: t(language, 'reader.toastTapToReview'),
      onPress: () => router.push('/vocabulary'),
      duration: 2400,
    })
  }, [haptics, showToast, language, router])
  const nextChapterRef = useRef<{ slug: string; title: string } | null>(null)
  const insets = useSafeAreaInsets()
  const topBarHeight = 56 + insets.top
  const footerHeight = 60 + insets.bottom

  // Immersive mode — auto-hide bars
  const [barsVisible, setBarsVisible] = useState(true)
  const barsVisibleRef = useRef(true)
  const barsAnim = useRef(new Animated.Value(1)).current
  const topBarTranslateY = barsAnim.interpolate({ inputRange: [0, 1], outputRange: [-topBarHeight, 0] })
  const footerTranslateY = barsAnim.interpolate({ inputRange: [0, 1], outputRange: [footerHeight, 0] })
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentChapterSlugRef = useRef<string | null>(null)
  const [visibleChapterSlug, setVisibleChapterSlug] = useState<string | null>(null)

  // Reading session tracking
  const { updateProgress: updateSessionProgress, sessionStartedAt } = useReadingSession({
    editionId: editionIdRef.current,
    wordCount: wordCountRef.current,
    isAuthenticated,
  })

  const hideBars = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    if (!barsVisibleRef.current) return
    barsVisibleRef.current = false
    setBarsVisible(false)
    Animated.timing(barsAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start()
  }, [barsAnim])

  const showBars = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    if (barsVisibleRef.current) return
    barsVisibleRef.current = true
    setBarsVisible(true)
    Animated.timing(barsAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
  }, [barsAnim])

  const startHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      hideBars()
    }, 3000)
  }, [hideBars])

  const toggleBars = useCallback(() => {
    if (barsVisibleRef.current) hideBars()
    else showBars()
  }, [hideBars, showBars])

  // When chapter first loads, show bars briefly then auto-hide so the
  // reader has chrome to orient with. From there on, visibility is
  // driven entirely by scroll direction (see handleMessage 'scrollDir').
  useEffect(() => {
    if (!loading && chapter) startHideTimer()
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
  }, [loading, chapter, startHideTimer])

  // Resolve editionId from bookSlug (needed for progress + bookmarks).
  // On network failure fall back to the offline book catalog so a fully
  // downloaded book still picks up its editionId, bookmarks, and progress
  // events keep working.
  const bookOpenedFiredRef = useRef(false)
  useEffect(() => {
    if (!bookSlug) return
    let cancelled = false
    const api = createBooksApi(language)
    api.getBook(bookSlug)
      .then(b => {
        if (cancelled) return
        editionIdRef.current = b.id
        bookTitleRef.current = b.title
        setBookTitle(b.title)
        if (!bookOpenedFiredRef.current) {
          bookOpenedFiredRef.current = true
          trackBookOpened({ source: 'library', editionId: b.id, language })
        }
        if (b.chapters) {
          setChapters(b.chapters)
          totalWordCountRef.current = b.chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0)
        }
        if (isAuthenticated) {
          bookmarksApi.getBookmarks(b.id)
            .then(res => { if (!cancelled) setBookmarks(res) })
            .catch(() => {})
        }
      })
      .catch(() => {
        getAllCachedBooks().then(books => {
          if (cancelled) return
          const match = books.find(b => b.slug === bookSlug)
          if (match) {
            editionIdRef.current = match.editionId
            bookTitleRef.current = match.title
            setBookTitle(match.title)
          }
        }).catch(() => {})
      })
    return () => { cancelled = true }
  }, [bookSlug, isAuthenticated, language])

  // Chapter fetch — network first, then SQLite cache. Adds cancellation so
  // rapid chapter navigation can't let a stale response stomp the current
  // chapter (R-4) and updates the offline-miss path to surface a real
  // empty-state rather than leaving the user on a permanent spinner.
  useEffect(() => {
    if (!bookSlug || !chapterSlug) return
    let cancelled = false
    setLoading(true)
    setChapterError(null)

    ;(async () => {
      let onlineError: unknown = null
      try {
        const api = createBooksApi(language)
        const ch = await api.getChapter(bookSlug, chapterSlug)
        if (cancelled) return
        setChapter(ch)
        wordCountRef.current = ch.wordCount || 0
        setLoading(false)
        return
      } catch (err) {
        onlineError = err
      }

      // Online fetch failed — try the offline cache. Prefer the
      // already-resolved editionId from the book effect; fall back to
      // iterating cached books so a cold start (no book meta yet) still
      // works.
      try {
        let editionId = editionIdRef.current
        if (!editionId) {
          const books = await getAllCachedBooks()
          if (cancelled) return
          editionId = books.find(b => b.slug === bookSlug)?.editionId ?? null
        }
        if (editionId) {
          const cached = await getCachedChapter(editionId, chapterSlug)
          if (cancelled) return
          if (cached) {
            setChapter({
              id: '',
              chapterNumber: 0,
              slug: cached.chapterSlug,
              title: cached.title,
              html: cached.html,
              wordCount: cached.wordCount,
              prev: cached.prev,
              next: cached.next,
            })
            wordCountRef.current = cached.wordCount || 0
            setLoading(false)
            return
          }
        }
      } catch (e) {
        if (!cancelled) console.warn('Offline cache read failed:', e)
      }

      // No online response AND no cached copy — show a proper empty state.
      if (cancelled) return
      const status = (onlineError as { status?: number } | null)?.status
      setChapter(null)
      setChapterError(status === 404 ? 'notfound' : 'offline')
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [bookSlug, chapterSlug, language])

  const saveProgress = useCallback(() => {
    if (!editionIdRef.current || !chapter || !chapterSlug) return
    const slug = currentChapterSlugRef.current || chapterSlug
    const percent = progressRef.current
    const updatedAt = Date.now()

    // Offline-first: always persist locally, even for guests. Survives flaky network,
    // crashes between PUTs, and gives ContinueReadingCard a fallback when server is
    // unreachable. LWW merge in consumers uses this `updatedAt`.
    saveLocalProgress(editionIdRef.current, {
      chapterId: chapter.id,
      chapterSlug: slug,
      percent,
      updatedAt,
    }).catch(() => {})

    if (!isAuthenticated) return
    readingProgressApi.updateProgress(editionIdRef.current, {
      chapterId: chapter.id,
      chapterSlug: slug,
      progress: percent,
    }).catch(() => {})
  }, [isAuthenticated, chapter, chapterSlug])

  // Save progress when leaving reader
  useEffect(() => {
    return () => { saveProgress() }
  }, [saveProgress])

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data)
      if (data.type === 'log') {
        if (__DEV__) {
          const fn = data.level === 'error' ? console.error : data.level === 'warn' ? console.warn : console.log
          fn('[WV]', data.msg)
        }
        return
      }
      if (data.type === 'tap') {
        toggleBars()
      } else if (data.type === 'scrollDir') {
        // ElevenReader-style reveal: scrolling back up (re-reading)
        // brings chrome back; scrolling forward hides it. Tap remains
        // as a manual toggle for discoverability.
        if (data.dir === 'up') showBars()
        else if (data.dir === 'down') hideBars()
      } else if (data.type === 'progress') {
        progressRef.current = data.progress
        setProgress(data.progress)
        updateSessionProgress(data.progress)
        if (data.chapterSlug) {
          currentChapterSlugRef.current = data.chapterSlug
          setVisibleChapterSlug(data.chapterSlug)
        }
      } else if (data.type === 'search') {
        setSearchMatchCount(data.matchCount || 0)
        setSearchCurrentMatch(data.currentMatch || 0)
      } else if (data.type === 'loaded') {
        // Enable infinite scroll if there's a next chapter
        if (chapter?.next) {
          nextChapterRef.current = chapter.next
          injectJs('enableInfiniteScroll()')
        }
      } else if (data.type === 'requestNextChapter') {
        loadNextChapter()
      } else if (data.type === 'highlightTap') {
        const hl = highlightsRef.current.find(h => h.id === data.highlightId)
        if (hl) setEditingHighlight(hl)
      } else if (data.type === 'selection') {
        if (data.text) {
          if (__DEV__) console.log('[diag] setSelection OPEN', data.text)
          const nextId = ++selectionIdRef.current
          setSelection({
            text: data.text,
            sentence: data.sentence || '',
            anchor: data.anchor || null,
            selectionId: nextId,
          })
          setWordSaved(false)
          setLookupState(null)
          // Single word: auto-TTS + auto-save to vocabulary (matches web behavior)
          if (!data.text.includes(' ')) {
            toggleTts(data.text, { rate: settings.ttsSpeed, lang: language })
            const keyLc = data.text.toLowerCase()
            const alreadySaved = !!vocabMapRef.current[keyLc]
            const alreadyAttempted = autoSavedRef.current.has(keyLc)
            if (__DEV__) console.log('[diag] tap gate — auth:', isAuthenticated, 'already-saved:', alreadySaved, 'attempted:', alreadyAttempted)
            if (isAuthenticated && !alreadySaved && !alreadyAttempted) {
              autoSavedRef.current.add(keyLc)
              vocabularyApi.saveWord({
                word: data.text,
                language,
                sentence: data.sentence || null,
                bookTitle: bookTitleRef.current || null,
                editionId: editionIdRef.current || null,
                chapterId: chapter?.id || null,
              }).then(resp => {
                if (resp.outcome === 'pending') {
                  if (__DEV__) console.log('[diag] saveWord pending (daily cap)')
                  showToast({ message: t(language, 'reader.vocab.queuedForTomorrow'), variant: 'info' })
                  return
                }
                if (resp.outcome === 'lookup' || resp.outcome === 'lookup_pending') {
                  if (__DEV__) console.log('[diag] saveWord', resp.outcome, 'id=', resp.lookupId)
                  if (resp.lookupId) {
                    setLookupState({ kind: resp.outcome, id: resp.lookupId, tapsRemaining: resp.tapsRemaining, busy: false })
                  }
                  // Let a re-tap hit the API again — that's how
                  // `lookup_pending` decrements `tapsRemaining`.
                  autoSavedRef.current.delete(keyLc)
                  return
                }
                if (resp.outcome === 'already_saved') {
                  if (__DEV__) console.log('[diag] saveWord already_saved')
                  // vocabMapRef may not have this key (e.g. stale fetch) — let a
                  // re-tap retry so underline can render on next interaction.
                  autoSavedRef.current.delete(keyLc)
                  return
                }
                const saved = resp.word
                if (!saved) return
                const key = saved.word.toLowerCase()
                vocabMapRef.current[key] = { stage: saved.stage, id: saved.id }
                if (__DEV__) console.log('[diag] saveWord OK → addVocabWord', key, saved.stage)
                injectJs(`addVocabWord(${JSON.stringify(key)}, ${saved.stage})`)
                setWordSaved(true)
                setSessionWordCount(c => c + 1)
                notifyWordSaved()
                trackVocabSaved({ language, nativeLanguage, source: 'reader' })
                // Persist translation
                const targetLang = nativeLanguage !== language ? nativeLanguage : 'en'
                trackTranslationUsed({ fromLang: language, toLang: targetLang, kind: 'word' })
                translationApi.translate(data.text, language, targetLang)
                  .then(res => {
                    if (res.translatedText && saved.id) {
                      vocabularyApi.updateWord(saved.id, { translation: res.translatedText }).catch(() => {})
                      vocabMapRef.current[key] = { ...vocabMapRef.current[key], translation: res.translatedText }
                      if (__DEV__) console.log('[diag] translation → markVocabWords', key, res.translatedText)
                      // Push full map so the inline-translation span renders above the underline.
                      // addVocabWord alone only carries {stage}, wiping any prior translation in
                      // _currentVocabMap and leaving the gray caption invisible.
                      injectJs(`markVocabWords(${JSON.stringify(vocabMapRef.current)})`)
                    }
                  }).catch((e) => { if (__DEV__) console.log('[diag] translate failed', e && e.message) })
              }).catch((e) => {
                autoSavedRef.current.delete(keyLc)
                if (__DEV__) console.log('[diag] saveWord failed', e && e.message)
              })
            }
          }
        } else {
          if (__DEV__) console.log('[diag] setSelection NULL (empty-data branch)')
          setSelection(null)
        }
      }
    } catch {}
  }, [chapter, settings.autoLookup, isAuthenticated, toggleBars, showBars, hideBars, notifyWordSaved])

  const navigateChapter = (slug: string) => {
    saveProgress()
    router.replace(`/reader/${bookSlug}/${slug}`)
  }

  const activeSlug = visibleChapterSlug ?? chapterSlug
  const isCurrentBookmarked = bookmarks.some(b => getSlugFromLocator(b.locator) === activeSlug)

  const toggleBookmark = async () => {
    if (!isAuthenticated || !editionIdRef.current || !chapter || !activeSlug) return
    const existing = bookmarks.find(b => getSlugFromLocator(b.locator) === activeSlug)
    if (existing) {
      // Optimistic remove — restore the bookmark if the server rejects it
      // so the UI doesn't silently lie about state (P2-3).
      setBookmarks(prev => prev.filter(b => b.id !== existing.id))
      try {
        await bookmarksApi.deleteBookmark(existing.id)
      } catch {
        setBookmarks(prev => (prev.some(b => b.id === existing.id) ? prev : [...prev, existing]))
        showToast({ message: 'Could not remove bookmark. Try again.', variant: 'error' })
      }
    } else {
      try {
        const bm = await bookmarksApi.createBookmark({
          editionId: editionIdRef.current,
          chapterId: chapter.id,
          locator: `chapter:${activeSlug}`,
          title: chapter.title,
        })
        setBookmarks(prev => [...prev, bm])
      } catch {
        showToast({ message: 'Could not add bookmark. Try again.', variant: 'error' })
      }
    }
  }

  const handleSaveWord = async () => {
    if (!selection || !isAuthenticated) return
    try {
      const resp = await vocabularyApi.saveWord({
        word: selection.text,
        language,
        sentence: selection.sentence || null,
        bookTitle: bookTitleRef.current || null,
        editionId: editionIdRef.current || null,
        chapterId: chapter?.id || null,
      })
      if (resp.outcome === 'pending') {
        showToast({ message: t(language, 'reader.vocab.queuedForTomorrow'), variant: 'info' })
        return
      }
      if (resp.outcome === 'lookup' || resp.outcome === 'lookup_pending') {
        if (resp.lookupId) {
          setLookupState({ kind: resp.outcome, id: resp.lookupId, tapsRemaining: resp.tapsRemaining, busy: false })
        }
        return
      }
      if (resp.outcome === 'already_saved') return
      const saved = resp.word
      if (!saved) return
      // Update local vocab map + WebView underlines
      const key = saved.word.toLowerCase()
      vocabMapRef.current[key] = { stage: saved.stage, id: saved.id }
      injectJs(`addVocabWord(${JSON.stringify(key)}, ${saved.stage})`)
      setWordSaved(true)
      setSessionWordCount(c => c + 1)
      notifyWordSaved()
      trackVocabSaved({ language, nativeLanguage, source: 'reader' })
      // Persist translation to saved word (fire-and-forget)
      const targetLang = nativeLanguage !== language ? nativeLanguage : 'en'
      trackTranslationUsed({ fromLang: language, toLang: targetLang, kind: 'word' })
      translationApi.translate(selection.text, language, targetLang)
        .then(res => {
          if (res.translatedText && saved.id) {
            vocabularyApi.updateWord(saved.id, { translation: res.translatedText }).catch(e => console.warn('Word translation persist failed:', e))
            vocabMapRef.current[key] = { ...vocabMapRef.current[key], translation: res.translatedText }
            // Push full map so the inline-translation span renders above the
            // underline (auto-save path does the same — this was missing here,
            // leaving manually-saved words without the gray caption).
            injectJs(`markVocabWords(${JSON.stringify(vocabMapRef.current)})`)
          }
        })
        .catch(e => console.warn('Word translation lookup failed:', e))
    } catch (e) {
      console.warn('Save word failed:', e)
      showToast({ message: 'Could not save word. Try again.', variant: 'error' })
    }
  }

  // F1 anti-spiral: "Add to SRS anyway" on a rare-word notice.
  // Promotes the WordLookup row → VocabularyWord (bypasses daily cap) and
  // mirrors the post-save flow so the word gets underlined + translated
  // just like a normal tap.
  const handlePromoteLookup = async () => {
    if (!selection || !lookupState) return
    setLookupState({ ...lookupState, busy: true })
    try {
      const saved = await vocabularyApi.promoteLookup(lookupState.id)
      const key = saved.word.toLowerCase()
      vocabMapRef.current[key] = { stage: saved.stage, id: saved.id }
      injectJs(`addVocabWord(${JSON.stringify(key)}, ${saved.stage})`)
      setLookupState(null)
      setWordSaved(true)
      setSessionWordCount(c => c + 1)
      notifyWordSaved()
      showToast({ message: t(language, 'reader.vocab.addedToSrs'), variant: 'success' })
      trackVocabSaved({ language, nativeLanguage, source: 'reader' })
      const targetLang = nativeLanguage !== language ? nativeLanguage : 'en'
      translationApi.translate(saved.word, language, targetLang)
        .then(res => {
          if (res.translatedText && saved.id) {
            vocabularyApi.updateWord(saved.id, { translation: res.translatedText }).catch(() => {})
            vocabMapRef.current[key] = { ...vocabMapRef.current[key], translation: res.translatedText }
            injectJs(`markVocabWords(${JSON.stringify(vocabMapRef.current)})`)
          }
        })
        .catch(() => {})
    } catch (e) {
      console.warn('Promote lookup failed:', e)
      setLookupState({ ...lookupState, busy: false })
      showToast({ message: t(language, 'reader.vocab.addAnywayFailed'), variant: 'error' })
    }
  }

  const handleMarkKnown = async () => {
    if (!selection || !isAuthenticated) return
    const key = selection.text.toLowerCase()
    const entry = vocabMapRef.current[key]
    if (!entry) return
    try {
      await vocabularyApi.markAsKnown(entry.id)
      vocabMapRef.current[key] = { ...entry, stage: 4 }
      injectJs(`addVocabWord(${JSON.stringify(key)}, 4)`)
      if (__DEV__) console.log('[diag] setSelection NULL (markKnown)')
      setSelection(null)
    } catch (e) {
      console.warn('Mark as known failed:', e)
      showToast({ message: 'Could not mark as known. Try again.', variant: 'error' })
    }
  }

  // B-79 web-parity: Ignore (remove) an already-saved word directly from the
  // WordCard. Optimistic update — we drop the word locally and re-mark the
  // WebView map immediately so the UI feels instant. On network failure the
  // snapshot is restored and a toast surfaces so the user knows to retry.
  // Note: no dedicated `removeVocabWord` helper in readerHtml.ts — the
  // existing `markVocabWords` re-renders the map from scratch, so passing
  // the updated map is sufficient.
  const handleRemoveWord = async () => {
    if (!selection || !isAuthenticated) return
    const key = selection.text.toLowerCase()
    const entry = vocabMapRef.current[key]
    if (!entry) return
    const snapshot = { ...entry }
    delete vocabMapRef.current[key]
    injectJs(`markVocabWords(${JSON.stringify(vocabMapRef.current)})`)
    setWordSaved(false)
    try {
      await vocabularyApi.deleteWord(entry.id)
      if (__DEV__) console.log('[diag] setSelection NULL (removeWord)')
      setSelection(null)
    } catch (e) {
      console.warn('Remove word failed:', e)
      // Rollback optimistic update
      vocabMapRef.current[key] = snapshot
      injectJs(`markVocabWords(${JSON.stringify(vocabMapRef.current)})`)
      setWordSaved(true)
      showToast({ message: 'Could not remove word. Try again.', variant: 'error' })
    }
  }

  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleExit = () => {
    saveProgress()
    if (sessionWordCount > 0) {
      setExitSummary(true)
      exitTimerRef.current = setTimeout(() => router.back(), 5000)
    } else {
      router.back()
    }
  }

  const handleExitReview = () => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    router.replace('/vocabulary/review')
  }

  const handleExitLater = () => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    router.back()
  }

  const handleHighlight = async (color: string) => {
    if (!selection || !isAuthenticated || !editionIdRef.current || !chapter) return
    try {
      const anchorJson = selection.anchor ? JSON.stringify(selection.anchor) : JSON.stringify({ exact: selection.text })
      const hl = await highlightsApi.createHighlight({
        editionId: editionIdRef.current,
        chapterId: chapter.id,
        anchorJson,
        color,
        selectedText: selection.text,
      })
      // Render highlight in WebView
      injectJs(`renderHighlight(${JSON.stringify(hl.id)}, ${JSON.stringify(selection.text)}, ${JSON.stringify(color)})`)
      highlightsRef.current = [...highlightsRef.current, hl]
      if (__DEV__) console.log('[diag] setSelection NULL (highlight created)')
      setSelection(null)
    } catch (e) {
      console.warn('Failed to create highlight:', e)
      showToast({ message: 'Could not add highlight. Try again.', variant: 'error' })
    }
  }

  // Load and render existing highlights when chapter loads.
  // Depending on the `chapter` object reference re-ran this effect any
  // time the chapter was refetched (e.g. retry), even though the id was
  // identical. Keying off `chapter?.id` (P3-4) makes the re-fetch fire
  // only when we actually switch chapters.
  useEffect(() => {
    const editionId = editionIdRef.current
    const chapterId = chapter?.id
    if (!isAuthenticated || !editionId || !chapterId) return
    let cancelled = false
    highlightsApi.getHighlights(editionId)
      .then(highlights => {
        if (cancelled) return
        const chapterHighlights = highlights.filter(h => h.chapterId === chapterId)
        highlightsRef.current = chapterHighlights
        for (const h of chapterHighlights) {
          injectJs(`renderHighlight(${JSON.stringify(h.id)}, ${JSON.stringify(h.selectedText)}, ${JSON.stringify(h.color)})`)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isAuthenticated, chapter?.id])

  // Vocab map ref for selection lookups
  const vocabMapRef = useRef<Record<string, { stage: number; id: string; translation?: string }>>({})

  // Load and render vocab word underlines. Keyed on `chapter?.id` so a
  // chapter refetch that yields the same id doesn't re-run the fetch
  // (P3-4). Also clears the auto-save dedup set so words attempted in the
  // previous chapter don't block retries in the next one.
  useEffect(() => {
    const chapterId = chapter?.id
    if (!isAuthenticated || !chapterId) return
    autoSavedRef.current.clear()
    let cancelled = false
    vocabularyApi.getReaderVocab()
      .then(words => {
        if (cancelled || words.length === 0) return
        const map: Record<string, { stage: number; id: string; translation?: string }> = {}
        for (const w of words) map[w.word.toLowerCase()] = { stage: w.stage, id: w.id, translation: w.translation }
        vocabMapRef.current = map
        injectJs(`markVocabWords(${JSON.stringify(map)})`)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isAuthenticated, chapter?.id])

  // Sync inline translations setting to WebView
  useEffect(() => {
    injectJs(`setShowInlineTranslations(${settings.showInlineTranslations})`)
  }, [settings.showInlineTranslations])

  const isMultiWord = !!(selection && selection.text.includes(' '))

  const deleteBookmark = async (id: string) => {
    // Snapshot the row we're removing so we can restore it on failure
    // (P2-3). Without the rollback the bookmark disappears from the
    // sheet even though it's still on the server.
    const snapshot = bookmarks.find(b => b.id === id)
    setBookmarks(prev => prev.filter(b => b.id !== id))
    try {
      await bookmarksApi.deleteBookmark(id)
    } catch {
      if (snapshot) {
        setBookmarks(prev => (prev.some(b => b.id === id) ? prev : [...prev, snapshot]))
      }
      showToast({ message: 'Could not remove bookmark. Try again.', variant: 'error' })
    }
  }

  // Wrap in try/catch so runtime errors in injected JS are forwarded to RN
  // via the console bridge, instead of being silently swallowed by the
  // `;true;` sentinel (diagnostics Phase 1).
  const injectJs = (js: string) =>
    webViewRef.current?.injectJavaScript(`try{${js}}catch(e){console.error('[diag] injectJs failed:', e && e.message, ${JSON.stringify(js.slice(0, 80))});};true;`)
  const handleSearch = (q: string) => injectJs(`searchInContent(${JSON.stringify(q)})`)
  const handleSearchNext = () => injectJs('nextMatch()')
  const handleSearchPrev = () => injectJs('prevMatch()')
  const handleSearchClose = () => { injectJs('clearSearch()'); setSearchOpen(false) }

  const loadNextChapter = async () => {
    const next = nextChapterRef.current
    if (!next || !bookSlug) return
    try {
      const api = createBooksApi(language)
      const ch = await api.getChapter(bookSlug, next.slug)
      const escaped = JSON.stringify(ch.html).slice(1, -1) // remove outer quotes
      injectJs(`appendChapter("${escaped}", ${JSON.stringify(ch.title)}, ${JSON.stringify(ch.slug)})`)
      wordCountRef.current += ch.wordCount || 0
      nextChapterRef.current = ch.next || null
      if (!ch.next) injectJs('disableInfiniteScroll()')
    } catch {
      injectJs('disableInfiniteScroll()')
    }
  }

  // Chapter counter for footer
  const currentChapterIndex = chapters.findIndex(c => c.slug === chapterSlug)
  const totalChapters = chapters.length

  // Large HTML string. Rebuilding every render burns CPU and — if the
  // source prop object is recreated — triggers WebView work. Memoize on
  // only the primitives the template actually reads (R-3).
  //
  // CRITICAL (B-77): these useMemo calls MUST run on every render — not
  // behind the `loading` / `!chapter` early returns below. Placing hooks
  // after early returns made React count fewer hooks on the loading frame
  // than on the loaded frame, tripping "Rendered more hooks than during
  // the previous render" and ErrorBoundary-unmounting the whole reader.
  // That cascade explained the symptoms the user reported: system Android
  // selection menu (no WebView overlay left to catch the tap), no
  // WordCard popup, and no translation.
  const html = useMemo(
    () => chapter
      ? buildReaderHtml(chapter.html, {
          fontSize: settings.fontSize,
          lineHeight: settings.lineHeight,
          fontFamily: resolvedFontFamily,
          textAlign: settings.textAlign,
          backgroundColor: resolvedTheme.backgroundColor,
          textColor: resolvedTheme.textColor,
        }, chapterSlug, { top: insets.top, bottom: insets.bottom })
      : '',
    [
      chapter?.html,
      settings.fontSize,
      settings.lineHeight,
      resolvedFontFamily,
      settings.textAlign,
      resolvedTheme.backgroundColor,
      resolvedTheme.textColor,
      chapterSlug,
      insets.top,
      insets.bottom,
    ],
  )
  // WebView source prop is compared shallowly; keeping the object
  // stable across renders avoids any accidental reloads on platforms
  // that key off reference.
  const webViewSource = useMemo(() => ({ html }), [html])

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!chapter) {
    // `chapterError` is 'offline' when we couldn't reach the server and
    // had no cached copy, 'notfound' on a confirmed 404 (R-4).
    const isNotFound = chapterError === 'notfound'
    return (
      <>
        <Stack.Screen options={{ title: '', headerShown: true, headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, headerShadowVisible: false }} />
        <View style={[styles.center, styles.errorWrap, { backgroundColor: colors.background }]}>
          <Ionicons
            name={isNotFound ? 'help-circle-outline' : 'cloud-offline-outline'}
            size={56}
            color={colors.textSecondary}
          />
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            {isNotFound ? "We couldn't find this chapter" : "This chapter isn't available offline"}
          </Text>
          <Text style={[styles.errorBody, { color: colors.textSecondary }]}>
            {isNotFound
              ? 'The chapter may have been removed or the link is outdated.'
              : 'Download the book for offline reading, or connect to the internet and try again.'}
          </Text>
          <TouchableOpacity
            style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: colors.primary, borderRadius: 10 }}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            activeOpacity={0.85}
          >
            <Text style={{ color: '#fff', fontFamily: fonts.sansMedium, fontSize: 15 }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </>
    )
  }

  const barBg = resolvedTheme.backgroundColor
  const barText = resolvedTheme.textColor

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar hidden={!barsVisible} />
      <View style={[styles.container, { backgroundColor: barBg }]}>
        {/* Reader WebView — rendered first so overlay bars sit on top */}
        <WebView
          ref={webViewRef}
          source={webViewSource}
          style={[styles.webview, { backgroundColor: resolvedTheme.backgroundColor }]}
          onMessage={handleMessage}
          originWhitelist={['*']}
          scrollEnabled
          showsVerticalScrollIndicator={false}
        />

        {/* Top bar — rendered after WebView so it's on top of native layer */}
        <Animated.View style={[styles.topBar, { backgroundColor: barBg, paddingTop: insets.top, opacity: barsAnim, transform: [{ translateY: topBarTranslateY }] }]} pointerEvents={barsVisible ? 'auto' : 'none'}>
          <TouchableOpacity onPress={handleExit} style={styles.topBarBtn}>
            <Ionicons name="chevron-back" size={24} color={barText} />
          </TouchableOpacity>
          <View style={styles.titleStack}>
            {bookTitle ? (
              <Text style={[styles.bookTitle, { color: barText }]} numberOfLines={1}>{bookTitle}</Text>
            ) : null}
            <Text style={[styles.chapterTitle, { color: barText + '99' }]} numberOfLines={1}>
              {chapter.title}
            </Text>
          </View>
          {sessionWordCount > 0 && (
            <View style={styles.wordsBadge}>
              <Ionicons name="school" size={12} color="#10B981" />
              <Text style={styles.wordsBadgeText}>{sessionWordCount}</Text>
            </View>
          )}
          <View style={styles.topBarRight}>
            {isAuthenticated && (
              <TouchableOpacity onPress={() => setBookmarksOpen(true)} style={styles.iconBtn}>
                <Ionicons name={isCurrentBookmarked ? 'bookmark' : 'bookmark-outline'} size={20} color={barText} />
              </TouchableOpacity>
            )}
            {chapters.length > 0 && (
              <TouchableOpacity onPress={() => setTocOpen(true)} style={styles.iconBtn}>
                <Ionicons name="list-outline" size={20} color={barText} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setSettingsOpen(true)} style={styles.iconBtn}>
              <Ionicons name="options-outline" size={20} color={barText} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Search bar */}
        {searchOpen && (
          <View style={{ position: 'absolute', top: topBarHeight, left: 0, right: 0, zIndex: 10 }}>
            <ReaderSearchBar
              onSearch={handleSearch}
              onNext={handleSearchNext}
              onPrev={handleSearchPrev}
              onClose={handleSearchClose}
              matchCount={searchMatchCount}
              currentMatch={searchCurrentMatch}
            />
          </View>
        )}

        {/* Selection: WordCard for single words, ActionBar for multi-word.
            Both are absolutely positioned above the footer via `bottomOffset`
            so they're not occluded by the progress chrome. */}
        {selection && (
          isMultiWord ? (
            <SelectionActionBar
              selectedText={selection.text}
              isMultiWord
              onDictionary={() => setDictOpen(true)}
              onTranslate={() => setTranslateOpen(true)}
              onSpeak={() => toggleTts(selection.text, { rate: settings.ttsSpeed, lang: language })}
              onSaveWord={handleSaveWord}
              onHighlight={handleHighlight}
              onMarkKnown={handleMarkKnown}
              isSpeaking={isSpeaking}
              wordSaved={wordSaved}
              vocabStage={vocabMapRef.current[selection.text.toLowerCase()]?.stage ?? null}
              isAuthenticated={isAuthenticated}
              bottomOffset={footerHeight}
            />
          ) : (
            <WordCard
              word={selection.text}
              selectionId={selection.selectionId}
              onSave={handleSaveWord}
              onSpeak={() => toggleTts(selection.text, { rate: settings.ttsSpeed, lang: language })}
              onRemove={handleRemoveWord}
              onMarkKnown={handleMarkKnown}
              onDismiss={() => {
                if (__DEV__) console.log('[diag] WordCard onDismiss fired')
                setSelection(null); setWordSaved(false); setLookupState(null)
              }}
              isSpeaking={isSpeaking}
              wordSaved={wordSaved}
              vocabStage={vocabMapRef.current[selection.text.toLowerCase()]?.stage ?? null}
              isAuthenticated={isAuthenticated}
              language={language}
              sessionWordCount={sessionWordCount}
              bottomOffset={footerHeight}
              lookupState={lookupState}
              onAddAnyway={handlePromoteLookup}
            />
          )
        )}

        {/* Footer — progress bar + info */}
        <Animated.View style={[styles.footer, { backgroundColor: barBg, borderTopColor: barText + '15', paddingBottom: insets.bottom, opacity: barsAnim, transform: [{ translateY: footerTranslateY }] }]} pointerEvents={barsVisible ? 'auto' : 'none'}>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: barText + '40' }]} />
          </View>
          <Text style={[styles.footerProgress, { color: barText + '99', textAlign: 'center', paddingVertical: 8, paddingHorizontal: 16 }]}>
            {Math.round(progress * 100)}%
            {totalChapters > 1 && currentChapterIndex >= 0 ? `   ${currentChapterIndex + 1} / ${totalChapters}` : ''}
          </Text>
        </Animated.View>

        {/* First-run tap-to-save hint — self-gated by AsyncStorage flag */}
        <ReaderTapCoachmark />

        {/* Reading stats widget */}
        {settings.showReaderStats && isAuthenticated && quickStats && barsVisible && (
          <ReaderStatsWidget
            sessionStartedAt={sessionStartedAt}
            todaySeconds={quickStats.todaySeconds}
            dailyGoalMinutes={quickStats.dailyGoalMinutes}
          />
        )}

        {/* Settings drawer */}
        <ReaderSettingsDrawer
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onUpdate={updateSettings}
        />

        {/* Bookmarks sheet */}
        <BookmarksSheet
          visible={bookmarksOpen}
          onClose={() => setBookmarksOpen(false)}
          bookmarks={bookmarks}
          currentChapterSlug={activeSlug || ''}
          onNavigate={navigateChapter}
          onDelete={deleteBookmark}
          onToggleCurrent={toggleBookmark}
          isCurrentBookmarked={isCurrentBookmarked}
        />

        {/* Dictionary sheet */}
        <DictionarySheet
          visible={dictOpen}
          word={selection?.text || ''}
          onClose={() => setDictOpen(false)}
          onSpeak={(t) => toggleTts(t, { rate: settings.ttsSpeed, lang: language })}
          fromLang={language}
        />

        {/* Translation sheet */}
        <TranslationSheet
          visible={translateOpen}
          text={selection?.text || ''}
          onClose={() => setTranslateOpen(false)}
          onSpeak={(t) => toggleTts(t, { rate: settings.ttsSpeed, lang: language })}
          fromLang={language}
        />

        {/* TOC sheet */}
        <TocSheet
          visible={tocOpen}
          chapters={chapters.map(c => ({ slug: c.slug, title: c.title, chapterNumber: c.chapterNumber }))}
          currentChapterSlug={activeSlug || ''}
          bookmarks={bookmarks.map(b => ({ chapterSlug: getSlugFromLocator(b.locator) }))}
          onNavigate={navigateChapter}
          onClose={() => setTocOpen(false)}
        />

        {/* Highlight note editor — Android-safe replacement for Alert.prompt */}
        <HighlightNoteModal
          visible={!!editingHighlight}
          snippet={editingHighlight
            ? editingHighlight.selectedText.substring(0, 120) + (editingHighlight.selectedText.length > 120 ? '…' : '')
            : ''}
          initialNote={editingHighlight?.noteText || ''}
          onCancel={() => setEditingHighlight(null)}
          onSave={async (note) => {
            const hl = editingHighlight
            setEditingHighlight(null)
            if (!hl) return
            try {
              const updated = await highlightsApi.updateHighlight(hl.id, { noteText: note || null })
              highlightsRef.current = highlightsRef.current.map(h => h.id === hl.id ? updated : h)
            } catch (e) {
              console.warn('Highlight note save failed:', e)
              showToast({ message: 'Could not save note. Try again.', variant: 'error' })
            }
          }}
          onDelete={async () => {
            const hl = editingHighlight
            setEditingHighlight(null)
            if (!hl) return
            try {
              await highlightsApi.deleteHighlight(hl.id)
              injectJs(`removeHighlight(${JSON.stringify(hl.id)})`)
              highlightsRef.current = highlightsRef.current.filter(h => h.id !== hl.id)
            } catch (e) {
              console.warn('Highlight delete failed:', e)
              showToast({ message: 'Could not delete highlight. Try again.', variant: 'error' })
            }
          }}
        />

        {/* Exit summary — words saved + review prompt */}
        {exitSummary && (
          <View style={styles.exitSummaryOverlay}>
            <View style={styles.exitSummaryCard}>
              <Ionicons name="checkmark-circle" size={40} color="#10B981" />
              <Text style={styles.exitSummaryText}>
                {sessionWordCount} word{sessionWordCount === 1 ? '' : 's'} saved
              </Text>
              <View style={styles.exitSummaryButtons}>
                <TouchableOpacity
                  style={[styles.exitSummaryBtn, { backgroundColor: '#C4704B' }]}
                  onPress={handleExitReview}
                >
                  <Text style={styles.exitSummaryBtnText}>Review Now</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.exitSummaryBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
                  onPress={handleExitLater}
                >
                  <Text style={styles.exitSummaryBtnText}>Later</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorWrap: {
    paddingHorizontal: 32,
    gap: 6,
  },
  errorTitle: {
    fontFamily: fonts.serifBold,
    fontSize: 20,
    marginTop: 16,
    textAlign: 'center',
  },
  errorBody: {
    fontFamily: fonts.sans,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 320,
  },
  container: { flex: 1 },
  // Top bar — absolute overlay, slides down on tap
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  topBarBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  titleStack: { flex: 1, marginHorizontal: 8 },
  bookTitle: { fontSize: 14, fontWeight: '600' as const, fontFamily: fonts.sansMedium },
  chapterTitle: { fontSize: 12, fontFamily: fonts.sans },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: { padding: 8, minWidth: 40, minHeight: 40, justifyContent: 'center' as const, alignItems: 'center' as const, borderRadius: 4 },
  webview: { flex: 1 },
  // Footer — absolute overlay, slides up on tap
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  footerProgress: { fontSize: 14, fontFamily: fonts.sans, fontVariant: ['tabular-nums'] },
  progressBar: { height: 4, borderRadius: 0 },
  progressFill: { height: 4, borderRadius: 0 },
  // Exit summary
  exitSummaryOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  exitSummaryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 32,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  exitSummaryText: {
    fontFamily: fonts.sansMedium,
    fontSize: 18,
    color: '#111827',
  },
  exitSummaryButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  exitSummaryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  exitSummaryBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: '#fff',
  },
  // Words badge in top bar
  wordsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  wordsBadgeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: '#10B981',
  },
})
