import { useEffect, useState, useRef, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { userBooksApi } from '@textstack/shared'
import type { UserBookChapterDto } from '@textstack/shared'
import { buildReaderHtml } from '../../../../src/lib/readerHtml'
import { useReaderSettings } from '../../../../src/hooks/useReaderSettings'
import { ReaderSettingsDrawer } from '../../../../src/components/ReaderSettingsDrawer'
import { colors } from '../../../../src/theme/colors'

export default function UserBookReaderScreen() {
  const { bookId, chapterSlug } = useLocalSearchParams<{ bookId: string; chapterSlug: string }>()
  const router = useRouter()
  const { settings, update: updateSettings, resolvedFontFamily, resolvedTheme } = useReaderSettings()
  const [chapter, setChapter] = useState<UserBookChapterDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const webViewRef = useRef<WebView>(null)
  const progressRef = useRef(0)

  useEffect(() => {
    if (!bookId || !chapterSlug) return
    setLoading(true)
    userBooksApi.getUserBookChapter(bookId, chapterSlug)
      .then(setChapter)
      .catch(e => console.error('Failed to load user book chapter:', e))
      .finally(() => setLoading(false))
  }, [bookId, chapterSlug])

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data)
      if (data.type === 'progress') {
        progressRef.current = data.progress
        // Save progress for user books
        if (bookId && chapterSlug) {
          userBooksApi.updateUserBookProgress(bookId, {
            progress: data.progress,
            chapterSlug,
          }).catch(() => {})
        }
      }
    } catch {}
  }, [bookId, chapterSlug])

  const navigateChapter = (slug: string) => {
    router.replace(`/my-books/read/${bookId}/${slug}`)
  }

  if (loading || !chapter) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const html = buildReaderHtml(chapter.html, {
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    fontFamily: resolvedFontFamily,
    backgroundColor: resolvedTheme.backgroundColor,
    textColor: resolvedTheme.textColor,
  })

  const barBg = resolvedTheme.backgroundColor
  const barText = resolvedTheme.textColor

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={[styles.container, { backgroundColor: barBg }]}>
        <View style={[styles.topBar, { borderBottomColor: barText + '20' }]}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 50 }}>
            <Text style={[styles.backButton, { color: colors.primary }]}>Back</Text>
          </TouchableOpacity>
          <Text style={[styles.chapterTitle, { color: barText }]} numberOfLines={1}>
            {chapter.title}
          </Text>
          <TouchableOpacity onPress={() => setSettingsOpen(true)} style={{ width: 50, alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 18 }}>Aa</Text>
          </TouchableOpacity>
        </View>

        <WebView
          ref={webViewRef}
          source={{ html }}
          style={[styles.webview, { backgroundColor: resolvedTheme.backgroundColor }]}
          onMessage={handleMessage}
          originWhitelist={['*']}
          scrollEnabled
          showsVerticalScrollIndicator={false}
        />

        <View style={[styles.bottomBar, { borderTopColor: barText + '20' }]}>
          <TouchableOpacity
            style={[styles.navButton, !chapter.prev && styles.navDisabled]}
            disabled={!chapter.prev}
            onPress={() => chapter.prev && navigateChapter(chapter.prev.slug)}
          >
            <Text style={styles.navText}>Prev</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navButton, !chapter.next && styles.navDisabled]}
            disabled={!chapter.next}
            onPress={() => chapter.next && navigateChapter(chapter.next.slug)}
          >
            <Text style={styles.navText}>Next</Text>
          </TouchableOpacity>
        </View>

        <ReaderSettingsDrawer
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onUpdate={updateSettings}
        />
      </SafeAreaView>
    </>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backButton: { fontSize: 15, fontWeight: '500' },
  chapterTitle: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '500' },
  webview: { flex: 1 },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  navButton: { paddingVertical: 8, paddingHorizontal: 16 },
  navDisabled: { opacity: 0.3 },
  navText: { fontSize: 15, color: colors.primary, fontWeight: '500' },
})
