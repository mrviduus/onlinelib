import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { createBooksApi, getStorageUrl, libraryApi, readingProgressApi } from '@textstack/shared'
import type { BookDetail } from '@textstack/shared'
import { useDownload } from '../../src/context/DownloadContext'
import { useAuth } from '../../src/context/AuthContext'
import { isBookFullyCached } from '../../src/lib/offlineDb'
import { colors } from '../../src/theme/colors'

const LANG = 'en'

export default function BookDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const { downloads, startDownload, cancelDownload, removeDownload } = useDownload()
  const [book, setBook] = useState<BookDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [cached, setCached] = useState(false)
  const [inLibrary, setInLibrary] = useState(false)
  const [continueSlug, setContinueSlug] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    const api = createBooksApi(LANG)
    api.getBook(slug)
      .then(async (b) => {
        setBook(b)
        setCached(await isBookFullyCached(b.id))
        // Check library + progress if authenticated
        if (isAuthenticated) {
          try {
            const lib = await libraryApi.getLibrary()
            setInLibrary(lib.some(item => item.editionId === b.id))
          } catch {}
          try {
            const p = await readingProgressApi.getProgress(b.id)
            if (p?.chapterSlug) setContinueSlug(p.chapterSlug)
          } catch {}
        }
      })
      .catch(e => console.error('Failed to load book:', e))
      .finally(() => setLoading(false))
  }, [slug, isAuthenticated])

  const dl = book ? downloads.get(book.id) : undefined
  const isDownloading = dl?.status === 'downloading'
  const progress = dl ? Math.round((dl.downloadedChapters / dl.totalChapters) * 100) : 0

  if (loading || !book) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: book.title, headerShown: true }} />
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Image
            source={getStorageUrl(book.coverPath)}
            style={styles.cover}
            contentFit="cover"
          />
          <View style={styles.meta}>
            <Text style={styles.title}>{book.title}</Text>
            {book.authors.length > 0 && (
              <Text style={styles.authors}>
                {book.authors.map(a => a.name).join(', ')}
              </Text>
            )}
            <Text style={styles.chapters}>{book.chapters.length} chapters</Text>
          </View>
        </View>

        {book.description && (
          <Text style={styles.description}>{book.description}</Text>
        )}

        {/* Action buttons */}
        <View style={styles.actions}>
          {book.chapters.length > 0 && (
            <TouchableOpacity
              style={styles.readButton}
              onPress={() => {
                const target = continueSlug || book.chapters[0].slug
                router.push(`/reader/${slug}/${target}`)
              }}
            >
              <Text style={styles.readButtonText}>
                {continueSlug ? 'Continue Reading' : 'Start Reading'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Save to Library */}
          {isAuthenticated && (
            <TouchableOpacity
              style={inLibrary ? styles.inLibraryButton : styles.saveLibraryButton}
              onPress={async () => {
                try {
                  if (inLibrary) {
                    await libraryApi.removeFromLibrary(book.id)
                    setInLibrary(false)
                  } else {
                    await libraryApi.addToLibrary(book.id)
                    setInLibrary(true)
                  }
                } catch {}
              }}
            >
              <Text style={inLibrary ? styles.inLibraryText : styles.saveLibraryText}>
                {inLibrary ? 'In Library ✓' : 'Save to Library'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Download / Cached status */}
          {cached ? (
            <TouchableOpacity
              style={styles.downloadedButton}
              onPress={() => removeDownload(book.id)}
            >
              <Text style={styles.downloadedText}>Downloaded — Remove</Text>
            </TouchableOpacity>
          ) : isDownloading ? (
            <TouchableOpacity
              style={styles.downloadingButton}
              onPress={() => cancelDownload(book.id)}
            >
              <Text style={styles.downloadingText}>Downloading {progress}% — Cancel</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.downloadButton}
              onPress={() => startDownload(book, LANG)}
            >
              <Text style={styles.downloadText}>Download for Offline</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.sectionTitle}>Chapters</Text>
        {book.chapters.map((ch) => (
          <TouchableOpacity
            key={ch.id}
            style={styles.chapterItem}
            onPress={() => router.push(`/reader/${slug}/${ch.slug}`)}
          >
            <Text style={styles.chapterNumber}>{ch.chapterNumber}</Text>
            <Text style={styles.chapterTitle} numberOfLines={1}>{ch.title}</Text>
          </TouchableOpacity>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', padding: 16 },
  cover: { width: 120, height: 180, borderRadius: 8, backgroundColor: colors.border },
  meta: { flex: 1, marginLeft: 16, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  authors: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  chapters: { fontSize: 13, color: colors.textSecondary, marginTop: 8 },
  description: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  actions: { paddingHorizontal: 16, marginBottom: 24, gap: 8 },
  readButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  readButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  downloadButton: {
    backgroundColor: colors.surface,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  downloadText: { fontSize: 14, color: colors.text, fontWeight: '500' },
  downloadingButton: {
    backgroundColor: colors.primaryLight,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  downloadingText: { fontSize: 14, color: colors.primary, fontWeight: '500' },
  downloadedButton: {
    backgroundColor: '#D1FAE5',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  downloadedText: { fontSize: 14, color: '#059669', fontWeight: '500' },
  saveLibraryButton: {
    backgroundColor: colors.surface,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  saveLibraryText: { fontSize: 14, color: colors.primary, fontWeight: '500' },
  inLibraryButton: {
    backgroundColor: '#D1FAE5',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  inLibraryText: { fontSize: 14, color: '#059669', fontWeight: '500' },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  chapterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chapterNumber: {
    width: 32,
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chapterTitle: { flex: 1, fontSize: 15, color: colors.text },
})
