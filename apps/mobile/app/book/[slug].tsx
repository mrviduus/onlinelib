import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { createBooksApi, getStorageUrl, getApiConfig, libraryApi, readingProgressApi } from '@textstack/shared'
import type { BookDetail } from '@textstack/shared'
import { useDownload } from '../../src/context/DownloadContext'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme } from '../../src/context/ThemeContext'
import { isBookFullyCached } from '../../src/lib/offlineDb'
import { fonts } from '../../src/theme/typography'
import { SkeletonLoader } from '../../src/components/ui/SkeletonLoader'
import { ReviewsSection } from '../../src/components/reviews/ReviewsSection'
import { MoodSelector } from '../../src/components/MoodSelector'

const LANG = 'en'

export default function BookDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const { colors } = useTheme()
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
      <>
        <Stack.Screen options={{ title: '', headerShown: true, headerStyle: { backgroundColor: colors.background }, headerShadowVisible: false }} />
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.header}>
            <SkeletonLoader width={160} height={240} borderRadius={8} />
          </View>
          <View style={{ paddingHorizontal: 16, gap: 8 }}>
            <SkeletonLoader width="60%" height={24} />
            <SkeletonLoader width="40%" height={16} />
            <SkeletonLoader width="100%" height={48} borderRadius={10} style={{ marginTop: 16 }} />
          </View>
        </View>
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{
        title: book.title,
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.sansMedium, fontSize: 16 },
        headerShadowVisible: false,
      }} />
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.coverWrapper}>
            <Image source={getStorageUrl(book.coverPath)} style={[styles.cover, { backgroundColor: colors.border }]} contentFit="cover" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{book.title}</Text>
          {book.authors.length > 0 && (
            <Text style={[styles.authors, { color: colors.textSecondary }]}>
              {book.authors.map(a => a.name).join(', ')}
            </Text>
          )}
          <View style={styles.metaRow}>
            <Ionicons name="document-text-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>{book.chapters.length} chapters</Text>
          </View>
        </View>

        {book.description && (
          <Text style={[styles.description, { color: colors.text }]}>{book.description}</Text>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {book.chapters.length > 0 && (
            <TouchableOpacity
              style={[styles.readButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                const target = continueSlug || book.chapters[0].slug
                router.push(`/reader/${slug}/${target}`)
              }}
              activeOpacity={0.85}
            >
              <Ionicons name={continueSlug ? 'play' : 'book-outline'} size={18} color="#fff" />
              <Text style={styles.readButtonText}>
                {continueSlug ? 'Continue Reading' : 'Start Reading'}
              </Text>
            </TouchableOpacity>
          )}

          {isAuthenticated && (
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: inLibrary ? colors.success : colors.primary }]}
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
              activeOpacity={0.85}
            >
              <Ionicons name={inLibrary ? 'checkmark-circle' : 'add-circle-outline'} size={18} color={inLibrary ? colors.success : colors.primary} />
              <Text style={[styles.secondaryButtonText, { color: inLibrary ? colors.success : colors.primary }]}>
                {inLibrary ? 'In Library' : 'Save to Library'}
              </Text>
            </TouchableOpacity>
          )}

          {cached ? (
            <TouchableOpacity style={[styles.secondaryButton, { borderColor: colors.success }]} onPress={() => removeDownload(book.id)} activeOpacity={0.85}>
              <Ionicons name="cloud-done-outline" size={18} color={colors.success} />
              <Text style={[styles.secondaryButtonText, { color: colors.success }]}>Downloaded — Remove</Text>
            </TouchableOpacity>
          ) : isDownloading ? (
            <TouchableOpacity style={[styles.secondaryButton, { borderColor: colors.primary }]} onPress={() => cancelDownload(book.id)} activeOpacity={0.85}>
              <Ionicons name="cloud-download-outline" size={18} color={colors.primary} />
              <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Downloading {progress}% — Cancel</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.secondaryButton, { borderColor: colors.border }]} onPress={() => startDownload(book, LANG)} activeOpacity={0.85}>
              <Ionicons name="download-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Download for Offline</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Moods */}
        <View style={{ paddingHorizontal: 16 }}>
          <MoodSelector editionId={book.id} />
        </View>

        {/* Reviews */}
        <ReviewsSection editionId={book.id} />

        {/* EPUB Download */}
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.border }]}
            onPress={() => {
              const { baseUrl } = getApiConfig()
              Linking.openURL(`${baseUrl}/${LANG}/books/${slug}/export/epub`).catch(() => {})
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="download-outline" size={18} color={colors.text} />
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Download EPUB</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Chapters</Text>
        {book.chapters.map((ch) => (
          <TouchableOpacity
            key={ch.id}
            style={[styles.chapterItem, { borderBottomColor: colors.border }]}
            onPress={() => router.push(`/reader/${slug}/${ch.slug}`)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chapterNumber, { color: colors.textSecondary }]}>{ch.chapterNumber}</Text>
            <Text style={[styles.chapterTitle, { color: colors.text }]} numberOfLines={1}>{ch.title}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}

        {/* Author section */}
        {book.authors.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
            <Text style={[styles.sectionTitle, { color: colors.text, paddingHorizontal: 0 }]}>About the Author</Text>
            {book.authors.map(a => (
              <TouchableOpacity
                key={a.slug}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}
                onPress={() => router.push(`/author/${a.slug}`)}
              >
                <Ionicons name="person-outline" size={18} color={colors.primary} />
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 15, color: colors.primary }}>{a.name}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* More by Author */}
        {book.moreByAuthor && book.moreByAuthor.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
            <Text style={[styles.sectionTitle, { color: colors.text, paddingHorizontal: 0 }]}>More by Author</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              {book.moreByAuthor.map(b => (
                <TouchableOpacity
                  key={b.id}
                  style={{ width: 100, marginRight: 12 }}
                  onPress={() => router.push(`/book/${b.slug}`)}
                  activeOpacity={0.7}
                >
                  <Image
                    source={b.coverPath ? getStorageUrl(b.coverPath) : undefined}
                    style={{ width: 100, height: 150, borderRadius: 6, backgroundColor: colors.border }}
                    contentFit="cover"
                  />
                  <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.text, marginTop: 6 }} numberOfLines={2}>{b.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Other Editions */}
        {book.otherEditions.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
            <Text style={[styles.sectionTitle, { color: colors.text, paddingHorizontal: 0 }]}>Other Editions</Text>
            {book.otherEditions.map(ed => (
              <TouchableOpacity
                key={ed.slug}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}
                onPress={() => router.push(`/book/${ed.slug}`)}
              >
                <Ionicons name="globe-outline" size={16} color={colors.primary} />
                <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.primary }}>
                  {ed.title} ({ed.language.toUpperCase()})
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', padding: 16 },
  hero: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  coverWrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
    marginBottom: 16,
  },
  cover: { width: 160, height: 240, borderRadius: 8 },
  title: { fontFamily: fonts.serifBold, fontSize: 24, textAlign: 'center', lineHeight: 30 },
  authors: { fontFamily: fonts.sans, fontSize: 15, marginTop: 6, textAlign: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  metaText: { fontFamily: fonts.sans, fontSize: 13 },
  description: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, paddingHorizontal: 16, marginBottom: 16 },
  actions: { paddingHorizontal: 16, marginBottom: 24, gap: 10 },
  readButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  readButtonText: { color: '#fff', fontFamily: fonts.sansMedium, fontSize: 16 },
  secondaryButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryButtonText: { fontFamily: fonts.sansMedium, fontSize: 14 },
  sectionTitle: { fontFamily: fonts.serifBold, fontSize: 20, paddingHorizontal: 16, marginBottom: 8 },
  chapterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  chapterNumber: { width: 32, fontFamily: fonts.sansMedium, fontSize: 14 },
  chapterTitle: { flex: 1, fontFamily: fonts.sans, fontSize: 15 },
})
