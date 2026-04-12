import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  BackHandler,
  useColorScheme,
} from 'react-native'
import { useRouter } from 'expo-router'
import { GestureDetector, Gesture } from 'react-native-gesture-handler'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  createBooksApi,
  userBooksApi,
  translationApi,
  splitSentences,
  tokenizeWords,
} from '@textstack/shared'
import type { Chapter, BookDetail, UserBookChapterDto } from '@textstack/shared'
import { useLanguage } from '../../context/LanguageContext'
import { useNativeLanguage } from '../../context/NativeLanguageContext'
import { useHaptics } from '../../hooks/useHaptics'
import { fonts } from '../../theme/typography'

export type FocusReaderMode = 'public' | 'userbook'

interface Props {
  mode: FocusReaderMode
  bookSlug?: string // public
  bookId?: string // userbook
  chapterSlug: string
}

interface TapState {
  key: string // `${sentenceIdx}:${wordIdx}`
  text: string | null
  loading: boolean
}

type ThemePref = 'light' | 'dark' | 'system'
const THEME_KEY = 'focus.theme'

// Strip HTML tags on-device (no DOM in RN). Collapses whitespace.
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

const SWIPE_THRESHOLD = 50

// Simple LRU cap for per-session translation cache.
const CACHE_MAX = 200

export function FocusReader({ mode, bookSlug, bookId, chapterSlug }: Props) {
  const router = useRouter()
  const { language } = useLanguage()
  const { nativeLanguage } = useNativeLanguage()
  const scheme = useColorScheme()
  const insets = useSafeAreaInsets()
  const haptics = useHaptics()

  // Theme pref (tri-state, persisted)
  const [themePref, setThemePref] = useState<ThemePref>('system')
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((saved) => {
        if (saved === 'light' || saved === 'dark' || saved === 'system') setThemePref(saved)
      })
      .catch(() => {})
  }, [])
  const cycleTheme = useCallback(() => {
    setThemePref((p) => {
      const next: ThemePref = p === 'system' ? 'light' : p === 'light' ? 'dark' : 'system'
      AsyncStorage.setItem(THEME_KEY, next).catch(() => {})
      return next
    })
  }, [])
  const isDark =
    themePref === 'dark' || (themePref === 'system' && scheme === 'dark')

  const [html, setHtml] = useState<string>('')
  const [bookLanguage, setBookLanguage] = useState<string>('en')
  const [chapterId, setChapterId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [tap, setTap] = useState<TapState | null>(null)

  const cacheRef = useRef<Map<string, string>>(new Map())
  const abortRef = useRef<AbortController | null>(null)
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const LONGPRESS_MS = 400

  const cancelPress = useCallback(() => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
  }, [])

  // Clean up any pending press timer on unmount
  useEffect(() => () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
  }, [])

  // Fetch chapter + book metadata
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        if (mode === 'public') {
          if (!bookSlug) return
          const api = createBooksApi(language)
          const [ch, bk] = await Promise.all<[Promise<Chapter>, Promise<BookDetail>]>([
            api.getChapter(bookSlug, chapterSlug),
            api.getBook(bookSlug),
          ] as unknown as [Promise<Chapter>, Promise<BookDetail>])
          if (cancelled) return
          setHtml(ch.html)
          setChapterId(ch.id)
          setBookLanguage(bk.language || 'en')
        } else {
          if (!bookId) return
          const [ch, book]: [UserBookChapterDto, { language: string }] = await Promise.all([
            userBooksApi.getUserBookChapter(bookId, chapterSlug),
            userBooksApi.getUserBook(bookId),
          ])
          if (cancelled) return
          setHtml(ch.html)
          setChapterId(ch.id)
          setBookLanguage(book.language || 'en')
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load chapter')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, bookSlug, bookId, chapterSlug, language])

  // Split sentences
  const sentences = useMemo(
    () => (html ? splitSentences(htmlToText(html), bookLanguage) : []),
    [html, bookLanguage],
  )

  // Restore/persist position per chapter
  const storageKey = chapterId ? `focus.${chapterId}.idx` : null
  useEffect(() => {
    if (!storageKey || sentences.length === 0) return
    AsyncStorage.getItem(storageKey)
      .then((saved) => {
        if (saved) {
          const n = parseInt(saved, 10)
          if (Number.isFinite(n)) {
            setCurrentIndex(Math.max(0, Math.min(n, sentences.length - 1)))
          }
        }
      })
      .catch(() => {})
    // only once per chapter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, sentences.length])

  useEffect(() => {
    if (!storageKey) return
    AsyncStorage.setItem(storageKey, String(currentIndex)).catch(() => {})
  }, [storageKey, currentIndex])

  // Exit → return to classic reader
  const exit = useCallback(() => {
    if (mode === 'public' && bookSlug) {
      router.replace(`/reader/${bookSlug}/${chapterSlug}`)
    } else if (mode === 'userbook' && bookId) {
      router.replace(`/my-books/read/${bookId}/${chapterSlug}`)
    } else {
      router.back()
    }
  }, [mode, bookSlug, bookId, chapterSlug, router])

  // Android hardware back → classic reader
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      exit()
      return true
    })
    return () => sub.remove()
  }, [exit])

  // Nav handlers
  const next = useCallback(() => {
    setTap(null)
    setCurrentIndex((i) => Math.min(i + 1, Math.max(0, sentences.length - 1)))
  }, [sentences.length])
  const prev = useCallback(() => {
    setTap(null)
    setCurrentIndex((i) => Math.max(0, i - 1))
  }, [])

  // Vertical pan — lives on a background layer behind the content so it
  // never competes with word onPress or ScrollView scroll.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onEnd((e) => {
          const dy = e.translationY
          const dx = e.translationX
          if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SWIPE_THRESHOLD) {
            if (dy < 0) next()
            else prev()
          }
        }),
    [next, prev],
  )

  // Tap word → inline translation
  // Deps exclude `tap` to prevent callback churn; toggle uses functional setter.
  const tapWord = useCallback(
    async (sentenceIdx: number, wordIdx: number, word: string) => {
      const key = `${sentenceIdx}:${wordIdx}`
      // Same-lang: silent skip + clear any prior tap
      if (bookLanguage === nativeLanguage) {
        setTap(null)
        return
      }
      let toggledOff = false
      setTap((prev) => {
        if (prev?.key === key) { toggledOff = true; return null }
        return { key, text: null, loading: true }
      })
      if (toggledOff) {
        abortRef.current?.abort()
        return
      }
      const cacheKey = `${bookLanguage}:${nativeLanguage}:${word.toLowerCase()}`
      const cached = cacheRef.current.get(cacheKey)
      if (cached) {
        setTap({ key, text: cached, loading: false })
        return
      }
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      try {
        const res = await translationApi.translate(word, bookLanguage, nativeLanguage, ctrl.signal)
        if (ctrl.signal.aborted) return
        const cache = cacheRef.current
        // LRU-ish: drop the oldest entry when we hit cap
        if (cache.size >= CACHE_MAX) {
          const oldest = cache.keys().next().value
          if (oldest !== undefined) cache.delete(oldest)
        }
        cache.set(cacheKey, res.translatedText)
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

  const bg = isDark ? '#0F0F0F' : '#FAFAFA'
  const fg = isDark ? '#EDEDED' : '#111'
  const muted = isDark ? '#B8B8B8' : '#666'
  const btnColor = isDark ? '#CCC' : '#444'

  // Theme toggle icon
  const themeIcon =
    themePref === 'light' ? 'sunny-outline'
      : themePref === 'dark' ? 'moon-outline'
      : 'contrast-outline'

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: bg }]} testID="focus-reader">
        <ActivityIndicator color={fg} />
      </View>
    )
  }

  if (error || !sentences.length) {
    return (
      <View style={[styles.root, { backgroundColor: bg }]} testID="focus-reader">
        <Text style={[styles.sentence, { color: fg }]}>
          {error || 'No readable content.'}
        </Text>
        <TouchableOpacity style={styles.exit} onPress={exit} accessibilityLabel="Exit focus mode">
          <Ionicons name="close" size={22} color={btnColor} />
        </TouchableOpacity>
      </View>
    )
  }

  const clampedIdx = Math.min(currentIndex, sentences.length - 1)
  const currentSentence = sentences[clampedIdx]
  const tokens = tokenizeWords(currentSentence)
  const progressPct = ((clampedIdx + 1) / sentences.length) * 100
  const sameLang = bookLanguage === nativeLanguage

  return (
    <View style={[styles.root, { backgroundColor: bg }]} testID="focus-reader">
      {/* Background Pan layer — absolute, behind content. Catches swipes that
          miss the content, and words (on top) keep getting normal onPress. */}
      <GestureDetector gesture={panGesture}>
        <View style={StyleSheet.absoluteFill} pointerEvents="box-only" />
      </GestureDetector>

      {/* Top-right controls */}
      <TouchableOpacity
        style={[styles.topBtn, styles.themeBtn, { top: insets.top + 8 }]}
        onPress={cycleTheme}
        accessibilityLabel={`Theme: ${themePref}`}
      >
        <Ionicons name={themeIcon as 'sunny-outline'} size={20} color={btnColor} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.topBtn, styles.exit, { top: insets.top + 8 }]}
        onPress={exit}
        accessibilityLabel="Exit focus mode"
      >
        <Ionicons name="close" size={22} color={btnColor} />
      </TouchableOpacity>

      {/* Floating tooltip above the sentence — one active word at a time */}
      {tap && !sameLang && (
        <View
          pointerEvents="none"
          style={[
            styles.tooltip,
            {
              top: insets.top + 52,
              backgroundColor: isDark ? '#EDEDED' : '#222',
            },
          ]}
        >
          <Text
            style={[styles.tooltipText, { color: isDark ? '#111' : '#fff' }]}
            numberOfLines={2}
          >
            {tap.loading ? '…' : tap.text || '—'}
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sentenceWrap}>
          <Text style={[styles.sentence, { color: fg }]} accessibilityLiveRegion="polite">
            {tokens.map((t, i) => {
              const k = `${clampedIdx}:${i}`
              const _active = tap?.key === k
              return (
                <Text key={k}>
                  <Text
                    onPressIn={sameLang ? undefined : () => {
                      cancelPress()
                      pressTimerRef.current = setTimeout(() => {
                        pressTimerRef.current = null
                        haptics.play('flip')
                        tapWord(clampedIdx, i, t.word)
                      }, LONGPRESS_MS)
                    }}
                    onPressOut={sameLang ? undefined : cancelPress}
                  >
                    {t.word}
                  </Text>
                  <Text>{t.trailing}</Text>
                </Text>
              )
            })}
          </Text>
        </View>
      </ScrollView>

      <Text style={[styles.counter, { color: muted, top: insets.top + 12 }]}>
        {clampedIdx + 1} / {sentences.length}
      </Text>

      <View style={[styles.progressRow, { bottom: insets.bottom + 12 }]} pointerEvents="none">
        <Text style={[styles.percent, { color: muted }]}>
          {Math.round(progressPct)}%
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: isDark ? '#2a2a2a' : '#e5e5e5' }]}>
          <View style={[styles.progressBar, { width: `${progressPct}%`, backgroundColor: fg }]} />
        </View>
      </View>

      {sameLang && (
        <Text style={[styles.sameLang, { color: muted, bottom: insets.bottom + 32 }]}>
          Same language — tap translation disabled
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    width: '100%',
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  sentenceWrap: {
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  sentence: {
    fontSize: 22,
    lineHeight: 33,
    fontFamily: fonts.serif,
    textAlign: 'center',
  },
  tooltip: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    zIndex: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  tooltipText: {
    fontSize: 15,
    fontFamily: fonts.sans,
    fontWeight: '500',
    textAlign: 'center',
  },
  topBtn: {
    position: 'absolute',
    zIndex: 10,
    padding: 10,
  },
  exit: {
    right: 16,
  },
  themeBtn: {
    right: 56,
  },
  progressRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  percent: {
    fontSize: 11,
    fontFamily: fonts.sans,
    letterSpacing: 0.5,
    minWidth: 34,
    opacity: 0.8,
  },
  progressTrack: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
    marginLeft: 10,
  },
  progressBar: {
    height: '100%',
    opacity: 0.9,
  },
  counter: {
    position: 'absolute',
    alignSelf: 'center',
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: fonts.sans,
    opacity: 0.8,
  },
  sameLang: {
    position: 'absolute',
    fontSize: 11,
    alignSelf: 'center',
    opacity: 0.7,
  },
})
