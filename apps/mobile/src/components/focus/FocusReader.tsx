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
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
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

export function FocusReader({ mode, bookSlug, bookId, chapterSlug }: Props) {
  const router = useRouter()
  const { language } = useLanguage()
  const { nativeLanguage } = useNativeLanguage()
  const scheme = useColorScheme()
  const isDark = scheme === 'dark'

  const [html, setHtml] = useState<string>('')
  const [bookLanguage, setBookLanguage] = useState<string>('en')
  const [chapterId, setChapterId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [tap, setTap] = useState<TapState | null>(null)

  const cacheRef = useRef<Map<string, string>>(new Map())
  const abortRef = useRef<AbortController | null>(null)

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
          const ch: UserBookChapterDto = await userBooksApi.getUserBookChapter(bookId, chapterSlug)
          if (cancelled) return
          setHtml(ch.html)
          setChapterId(ch.id)
          setBookLanguage(language)
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

  // Vertical pan gesture with threshold. .runOnJS(true) lets the onEnd
  // callback call React state setters without needing reanimated worklets.
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
  const tapWord = useCallback(
    async (sentenceIdx: number, wordIdx: number, word: string) => {
      const key = `${sentenceIdx}:${wordIdx}`
      // Toggle off if same word
      if (tap?.key === key) {
        setTap(null)
        abortRef.current?.abort()
        return
      }
      // Same-lang guard (ADR requirement)
      if (bookLanguage === nativeLanguage) return

      // Cache lookup
      const cacheKey = `${bookLanguage}:${nativeLanguage}:${word.toLowerCase()}`
      const cached = cacheRef.current.get(cacheKey)
      if (cached) {
        setTap({ key, text: cached, loading: false })
        return
      }

      // Cancel previous in-flight request
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl

      setTap({ key, text: null, loading: true })
      try {
        const res = await translationApi.translate(word, bookLanguage, nativeLanguage, ctrl.signal)
        if (ctrl.signal.aborted) return
        cacheRef.current.set(cacheKey, res.translatedText)
        setTap({ key, text: res.translatedText, loading: false })
      } catch (err) {
        if (ctrl.signal.aborted) return
        if ((err as { name?: string })?.name === 'AbortError') return
        setTap({ key, text: '—', loading: false })
      }
    },
    [tap, bookLanguage, nativeLanguage],
  )

  const bg = isDark ? '#0F0F0F' : '#FAFAFA'
  const fg = isDark ? '#E8E8E8' : '#111'
  const muted = isDark ? '#888' : '#888'

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
          <Ionicons name="close" size={22} color={fg} />
        </TouchableOpacity>
      </View>
    )
  }

  const clampedIdx = Math.min(currentIndex, sentences.length - 1)
  const currentSentence = sentences[clampedIdx]
  const tokens = tokenizeWords(currentSentence)
  const progressPct = ((clampedIdx + 1) / sentences.length) * 100

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GestureDetector gesture={panGesture}>
        <View style={[styles.root, { backgroundColor: bg }]} testID="focus-reader">
          <TouchableOpacity style={styles.exit} onPress={exit} accessibilityLabel="Exit focus mode">
            <Ionicons name="close" size={22} color={fg} />
          </TouchableOpacity>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sentenceWrap}>
              <Text style={[styles.sentence, { color: fg }]} accessibilityLiveRegion="polite">
                {tokens.map((t, i) => {
                  const k = `${clampedIdx}:${i}`
                  const active = tap?.key === k
                  return (
                    <Text key={k}>
                      <Text
                        style={styles.word}
                        onPress={() => tapWord(clampedIdx, i, t.word)}
                      >
                        {t.word}
                      </Text>
                      {active && (tap?.loading ? (
                        <Text style={[styles.translation, { color: muted }]}> …</Text>
                      ) : tap?.text ? (
                        <Text style={[styles.translation, { color: muted }]}> {tap.text}</Text>
                      ) : null)}
                      <Text>{t.trailing}</Text>
                    </Text>
                  )
                })}
              </Text>
            </View>
          </ScrollView>

          <View style={[styles.progressTrack, { backgroundColor: isDark ? '#333' : '#e5e5e5' }]}>
            <View style={[styles.progressBar, { width: `${progressPct}%`, backgroundColor: fg }]} />
          </View>
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
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
  word: {
    // Pressable via onPress on <Text>; no extra bg so taps feel invisible.
  },
  translation: {
    fontSize: 14,
    fontStyle: 'italic',
    fontFamily: fonts.sans,
  },
  exit: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 10,
    padding: 10,
    opacity: 0.5,
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  progressBar: {
    height: '100%',
    opacity: 0.4,
  },
})
