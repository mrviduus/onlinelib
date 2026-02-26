import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native'
import { Image } from 'expo-image'
import { useRouter, useFocusEffect } from 'expo-router'
import {
  libraryApi, readingProgressApi, userBooksApi, getStorageUrl,
} from '@textstack/shared'
import type { UserLibraryItem, UserBookDto, ReadingProgressDto } from '@textstack/shared'
import { useAuth } from '../../src/context/AuthContext'
import { colors } from '../../src/theme/colors'

type Tab = 'saved' | 'uploads'

export default function LibraryScreen() {
  const { isAuthenticated } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('saved')
  const [library, setLibrary] = useState<UserLibraryItem[]>([])
  const [userBooks, setUserBooks] = useState<UserBookDto[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, ReadingProgressDto>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return }
    try {
      const [lib, progress, books] = await Promise.all([
        libraryApi.getLibrary(),
        readingProgressApi.getAllProgress(),
        userBooksApi.getUserBooks(),
      ])
      setLibrary(lib)
      setUserBooks(books)
      const map: Record<string, ReadingProgressDto> = {}
      for (const p of progress) map[p.editionId] = p
      setProgressMap(map)
    } catch (e) {
      console.error('Library load error:', e)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => { loadData() }, [loadData])

  // Refresh on focus (e.g. after reading)
  useFocusEffect(useCallback(() => {
    if (isAuthenticated && !loading) loadData()
  }, [isAuthenticated, loading, loadData]))

  const onRefresh = async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>My Library</Text>
        <Text style={styles.emptyText}>Sign in to access your library</Text>
        <TouchableOpacity style={styles.signInBtn} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.signInText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Tab switcher */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'saved' && styles.tabActive]}
          onPress={() => setTab('saved')}
        >
          <Text style={[styles.tabText, tab === 'saved' && styles.tabTextActive]}>
            Saved ({library.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'uploads' && styles.tabActive]}
          onPress={() => setTab('uploads')}
        >
          <Text style={[styles.tabText, tab === 'uploads' && styles.tabTextActive]}>
            My Uploads ({userBooks.length})
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'saved' ? (
        <SavedList
          library={library}
          progressMap={progressMap}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      ) : (
        <UploadsList
          books={userBooks}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      )}
    </View>
  )
}

function SavedList({
  library, progressMap, refreshing, onRefresh,
}: {
  library: UserLibraryItem[]
  progressMap: Record<string, ReadingProgressDto>
  refreshing: boolean
  onRefresh: () => void
}) {
  const router = useRouter()

  if (library.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No saved books yet</Text>
        <Text style={styles.emptySubtext}>Browse books and save them to your library</Text>
      </View>
    )
  }

  const sorted = [...library].sort(
    (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
  )

  return (
    <FlatList
      data={sorted}
      keyExtractor={item => item.editionId}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => {
        const progress = progressMap[item.editionId]
        const pct = progress ? Math.round(progress.progress * 100) : 0
        const continueSlug = progress?.chapterSlug

        return (
          <TouchableOpacity
            style={styles.bookRow}
            onPress={() => router.push(`/book/${item.edition.slug}`)}
          >
            <Image
              source={item.edition.coverPath ? getStorageUrl(item.edition.coverPath) : undefined}
              style={styles.cover}
              contentFit="cover"
            />
            <View style={styles.bookInfo}>
              <Text style={styles.bookTitle} numberOfLines={2}>{item.edition.title}</Text>
              {item.edition.authors.length > 0 && (
                <Text style={styles.bookAuthor} numberOfLines={1}>
                  {item.edition.authors.map(a => a.name).join(', ')}
                </Text>
              )}

              {/* Progress bar */}
              {pct > 0 && (
                <View style={styles.progressRow}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{pct}%</Text>
                </View>
              )}

              {/* Continue reading */}
              {continueSlug ? (
                <TouchableOpacity
                  style={styles.continueBtn}
                  onPress={() => router.push(`/reader/${item.edition.slug}/${continueSlug}`)}
                >
                  <Text style={styles.continueBtnText}>Continue Reading</Text>
                </TouchableOpacity>
              ) : (
                item.edition.chapterCount > 0 && (
                  <Text style={styles.chapterCount}>{item.edition.chapterCount} chapters</Text>
                )
              )}
            </View>
          </TouchableOpacity>
        )
      }}
    />
  )
}

function UploadsList({
  books, refreshing, onRefresh,
}: {
  books: UserBookDto[]
  refreshing: boolean
  onRefresh: () => void
}) {
  const router = useRouter()

  return (
    <View style={{ flex: 1 }}>
      {/* Upload button */}
      <TouchableOpacity
        style={styles.uploadBtn}
        onPress={() => router.push('/my-books/upload')}
      >
        <Text style={styles.uploadBtnText}>+ Upload Book</Text>
      </TouchableOpacity>

      {books.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No uploaded books</Text>
          <Text style={styles.emptySubtext}>Upload EPUB or PDF files to read</Text>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.bookRow}
              onPress={() => {
                if (item.status === 'completed') router.push(`/my-books/${item.id}`)
              }}
              disabled={item.status !== 'completed'}
            >
              <Image
                source={item.coverPath ? getStorageUrl(item.coverPath) : undefined}
                style={styles.cover}
                contentFit="cover"
              />
              <View style={styles.bookInfo}>
                <Text style={styles.bookTitle} numberOfLines={2}>
                  {item.title || 'Untitled'}
                </Text>
                {item.author && (
                  <Text style={styles.bookAuthor} numberOfLines={1}>{item.author}</Text>
                )}
                <StatusBadge status={item.status} chapterCount={item.chapterCount} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  )
}

function StatusBadge({ status, chapterCount }: { status: UserBookDto['status']; chapterCount: number }) {
  if (status === 'completed') {
    return <Text style={styles.statusReady}>{chapterCount} chapters</Text>
  }
  if (status === 'failed') {
    return <Text style={styles.statusFailed}>Processing failed</Text>
  }
  return <Text style={styles.statusProcessing}>Processing...</Text>
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  signInBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  signInText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Tabs
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  tabTextActive: { color: colors.primary },

  // List
  listContent: { paddingBottom: 20 },
  bookRow: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cover: {
    width: 60,
    height: 90,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  bookInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  bookTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  bookAuthor: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  chapterCount: { fontSize: 12, color: colors.textSecondary, marginTop: 6 },

  // Progress
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  progressText: { fontSize: 11, color: colors.textSecondary, width: 32 },

  // Continue
  continueBtn: {
    marginTop: 6,
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  continueBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Upload
  uploadBtn: {
    margin: 12,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  uploadBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Status badges
  statusReady: { fontSize: 12, color: '#059669', marginTop: 6 },
  statusFailed: { fontSize: 12, color: '#DC2626', marginTop: 6 },
  statusProcessing: { fontSize: 12, color: colors.primary, marginTop: 6 },
})
