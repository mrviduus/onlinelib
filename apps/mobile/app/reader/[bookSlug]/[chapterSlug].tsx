import { useEffect, useRef, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { readingProgressApi, parseScrollLocator } from '@textstack/shared'
import { getLocalProgress } from '../../../src/lib/progressStorage'
import { useAuth } from '../../../src/context/AuthContext'
import { useReaderBookmarks, getSlugFromLocator } from '../../../src/hooks/useReaderBookmarks'
import { useReaderProgress } from '../../../src/hooks/useReaderProgress'
import { useReaderChapter } from '../../../src/hooks/useReaderChapter'
import { useReaderBook } from '../../../src/hooks/useReaderBook'
import { useReaderInfiniteScroll } from '../../../src/hooks/useReaderInfiniteScroll'
import { ReaderShell } from '../../../src/components/reader/ReaderShell'
import { useToast } from '../../../src/context/ToastContext'
import { useTheme } from '../../../src/context/ThemeContext'
import { useLanguage } from '../../../src/context/LanguageContext'
import { fonts } from '../../../src/theme/typography'
import { Ionicons } from '@expo/vector-icons'

/**
 * Public-library reader route. Thin wrapper around <ReaderShell>: owns the
 * catalog data hooks (chapter, book, bookmarks, progress, infinite scroll),
 * handles loading/error, and hands the loaded chapter + a `kind: 'edition'`
 * source down to the shared shell.
 */
export default function ReaderScreen() {
  const { bookSlug, chapterSlug } = useLocalSearchParams<{ bookSlug: string; chapterSlug: string }>()
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const { colors } = useTheme()
  const { language } = useLanguage()
  const { show: showToast } = useToast()

  const webViewRef = useRef<WebView>(null)
  const injectJs = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(`try{${js}}catch(e){console.error('[diag] injectJs failed:', e && e.message, ${JSON.stringify(js.slice(0, 80))});};true;`)
  }, [])

  const progressRef = useRef(0)
  const scrollOffsetRef = useRef(0)
  const currentChapterSlugRef = useRef<string | null>(null)
  const bookProgressRef = useRef<number | null>(null)
  const totalWordCountRef = useRef(0)
  const editionIdRef = useRef<string | null>(null)
  const bookTitleRef = useRef<string | null>(null)
  const savedPercentRef = useRef<number | null>(null)
  const savedScrollOffsetRef = useRef<number | null>(null)
  const restoreScrolledRef = useRef(false)

  const { chapter, loading, chapterError, wordCountRef } = useReaderChapter({
    bookSlug,
    chapterSlug,
    language,
    editionIdRef,
  })

  const {
    bookmarks,
    setBookmarks,
    toggle: toggleBookmark,
    remove: removeBookmark,
  } = useReaderBookmarks({ editionIdRef, isAuthenticated, showToast })

  const { bookTitle, chapters, editionId, chaptersLoading } = useReaderBook({
    bookSlug,
    language,
    isAuthenticated,
    editionIdRef,
    bookTitleRef,
    totalWordCountRef,
    setBookmarks,
  })

  const { saveProgress, bumpProgress } = useReaderProgress({
    editionIdRef,
    chapter,
    chapterSlug,
    currentChapterSlugRef,
    progressRef,
    scrollOffsetRef,
    bookPercentRef: bookProgressRef,
    isAuthenticated,
  })

  const { enableForChapter: enableInfiniteScrollFor, loadNext: loadNextChapter } = useReaderInfiniteScroll({
    bookSlug,
    language,
    injectJs,
    wordCountRef,
  })

  // Load saved in-chapter position. Local-first (instant, offline-safe);
  // fall back to server for the cross-device case. One-shot per
  // (editionId, chapterSlug) — guard with ref so we don't re-scroll after
  // settings tweaks rebuild the HTML.
  useEffect(() => {
    restoreScrolledRef.current = false
    savedPercentRef.current = null
    savedScrollOffsetRef.current = null
    if (!editionId || !chapterSlug) return
    let cancelled = false
    ;(async () => {
      let percent: number | null = null
      let scrollOffset: number | null = null
      try {
        const local = await getLocalProgress(editionId)
        if (local && local.chapterSlug === chapterSlug) {
          if (typeof local.percent === 'number') percent = local.percent
          const parsed = parseScrollLocator(local.locator)
          if (parsed && parsed.slug === chapterSlug && parsed.offset > 0) {
            scrollOffset = parsed.offset
          }
        }
      } catch {}
      if (percent == null && scrollOffset == null && isAuthenticated) {
        try {
          const server = await readingProgressApi.getProgress(editionId)
          if (server && server.chapterSlug === chapterSlug && typeof server.percent === 'number') {
            percent = server.percent
          }
        } catch {}
      }
      if (cancelled) return
      if (percent != null && percent > 0.005 && percent < 0.999) {
        savedPercentRef.current = percent
      }
      if (scrollOffset != null) {
        savedScrollOffsetRef.current = scrollOffset
      }
    })()
    return () => { cancelled = true }
  }, [editionId, chapterSlug, isAuthenticated])

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!chapter) {
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

  return (
    <ReaderShell
      source={{ kind: 'edition', id: editionId, idRef: editionIdRef }}
      webViewRef={webViewRef}
      injectJs={injectJs}
      chapter={{ id: chapter.id, title: chapter.title, html: chapter.html, prev: chapter.prev, next: chapter.next }}
      chapterSlug={chapterSlug}
      htmlChapterSlug={chapterSlug}
      bookTitle={bookTitle}
      chapters={chapters}
      chaptersLoading={chaptersLoading}
      progressRef={progressRef}
      scrollOffsetRef={scrollOffsetRef}
      currentChapterSlugRef={currentChapterSlugRef}
      bookProgressRef={bookProgressRef}
      totalWordCountRef={totalWordCountRef}
      bumpProgress={bumpProgress}
      saveProgress={saveProgress}
      restoreScrolledRef={restoreScrolledRef}
      savedScrollOffsetRef={savedScrollOffsetRef}
      savedPercentRef={savedPercentRef}
      onChapterLoaded={() => enableInfiniteScrollFor(chapter)}
      onRequestNextChapter={loadNextChapter}
      onNavigateChapter={(slug) => router.replace(`/reader/${bookSlug}/${slug}`)}
      bookmarks={bookmarks}
      onToggleCurrentBookmark={(slug) => { if (chapter) toggleBookmark({ chapter, slug }) }}
      onDeleteBookmark={removeBookmark}
      bookmarkChapterSlug={(b) => getSlugFromLocator(b.locator)}
      bookTitleRef={bookTitleRef}
      wordCount={wordCountRef.current}
      explainBookId={editionIdRef.current || undefined}
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorWrap: { paddingHorizontal: 32, gap: 6 },
  errorTitle: { fontFamily: fonts.serifBold, fontSize: 20, marginTop: 16, textAlign: 'center' },
  errorBody: { fontFamily: fonts.sans, fontSize: 14, textAlign: 'center', marginTop: 4, maxWidth: 320 },
})
