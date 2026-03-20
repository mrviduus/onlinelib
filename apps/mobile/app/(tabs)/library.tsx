import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native'
import { Image } from 'expo-image'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  libraryApi, readingProgressApi, userBooksApi, getStorageUrl,
} from '@textstack/shared'
import type { UserLibraryItem, UserBookDto, ReadingProgressDto } from '@textstack/shared'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme } from '../../src/context/ThemeContext'
import { fonts } from '../../src/theme/typography'
import { SkeletonLoader } from '../../src/components/ui/SkeletonLoader'

type Tab = 'saved' | 'uploads'

export default function LibraryScreen() {
  const { isAuthenticated } = useAuth()
  const { colors } = useTheme()
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
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="library-outline" size={56} color={colors.border} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>My Library</Text>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Sign in to access your library</Text>
        <TouchableOpacity style={[styles.signInBtn, { backgroundColor: colors.primary }]} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.signInText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.skeletonList}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.bookRow, { borderBottomColor: colors.border }]}>
              <SkeletonLoader width={70} height={105} borderRadius={6} />
              <View style={styles.bookInfo}>
                <SkeletonLoader width="70%" height={16} />
                <SkeletonLoader width="40%" height={13} style={{ marginTop: 6 }} />
                <SkeletonLoader width="90%" height={4} style={{ marginTop: 12 }} />
              </View>
            </View>
          ))}
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(['saved', 'uploads'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.textSecondary }]}>
              {t === 'saved' ? `Saved (${library.length})` : `Uploads (${userBooks.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'saved' ? (
        <SavedList library={library} progressMap={progressMap} refreshing={refreshing} onRefresh={onRefresh} />
      ) : (
        <UploadsList books={userBooks} refreshing={refreshing} onRefresh={onRefresh} />
      )}
    </View>
  )
}

function SavedList({ library, progressMap, refreshing, onRefresh }: {
  library: UserLibraryItem[]; progressMap: Record<string, ReadingProgressDto>; refreshing: boolean; onRefresh: () => void
}) {
  const router = useRouter()
  const { colors } = useTheme()

  if (library.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="book-outline" size={48} color={colors.border} />
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No saved books yet</Text>
        <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Browse books and save them to your library</Text>
      </View>
    )
  }

  const sorted = [...library].sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())

  return (
    <FlatList
      data={sorted}
      keyExtractor={item => item.editionId}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => {
        const progress = progressMap[item.editionId]
        const pct = progress ? Math.round(progress.progress * 100) : 0
        const continueSlug = progress?.chapterSlug

        return (
          <TouchableOpacity
            style={[styles.bookRow, { borderBottomColor: colors.border }]}
            onPress={() => router.push(`/book/${item.edition.slug}`)}
            activeOpacity={0.85}
          >
            <View style={styles.coverWrapper}>
              <Image
                source={item.edition.coverPath ? getStorageUrl(item.edition.coverPath) : undefined}
                style={[styles.cover, { backgroundColor: colors.border }]}
                contentFit="cover"
              />
            </View>
            <View style={styles.bookInfo}>
              <Text style={[styles.bookTitle, { color: colors.text }]} numberOfLines={2}>{item.edition.title}</Text>
              {item.edition.authors.length > 0 && (
                <Text style={[styles.bookAuthor, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.edition.authors.map(a => a.name).join(', ')}
                </Text>
              )}
              {pct > 0 && (
                <View style={styles.progressRow}>
                  <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                  </View>
                  <Text style={[styles.progressText, { color: colors.textSecondary }]}>{pct}%</Text>
                </View>
              )}
              {continueSlug ? (
                <TouchableOpacity
                  style={[styles.continueBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.push(`/reader/${item.edition.slug}/${continueSlug}`)}
                >
                  <Ionicons name="play" size={12} color="#fff" />
                  <Text style={styles.continueBtnText}>Continue</Text>
                </TouchableOpacity>
              ) : (
                item.edition.chapterCount > 0 && (
                  <Text style={[styles.chapterCount, { color: colors.textSecondary }]}>{item.edition.chapterCount} chapters</Text>
                )
              )}
            </View>
          </TouchableOpacity>
        )
      }}
    />
  )
}

function UploadsList({ books, refreshing, onRefresh }: {
  books: UserBookDto[]; refreshing: boolean; onRefresh: () => void
}) {
  const router = useRouter()
  const { colors } = useTheme()

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity
        style={[styles.uploadBtn, { borderColor: colors.primary }]}
        onPress={() => router.push('/my-books/upload')}
      >
        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
        <Text style={[styles.uploadBtnText, { color: colors.primary }]}>Upload Book</Text>
      </TouchableOpacity>

      {books.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cloud-upload-outline" size={48} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No uploaded books</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Upload EPUB or PDF files to read</Text>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.bookRow, { borderBottomColor: colors.border }]}
              onPress={() => { if (item.status === 'completed') router.push(`/my-books/${item.id}`) }}
              disabled={item.status !== 'completed'}
              activeOpacity={0.85}
            >
              <View style={styles.coverWrapper}>
                <Image
                  source={item.coverPath ? getStorageUrl(item.coverPath) : undefined}
                  style={[styles.cover, { backgroundColor: colors.border }]}
                  contentFit="cover"
                />
              </View>
              <View style={styles.bookInfo}>
                <Text style={[styles.bookTitle, { color: colors.text }]} numberOfLines={2}>{item.title || 'Untitled'}</Text>
                {item.author && <Text style={[styles.bookAuthor, { color: colors.textSecondary }]} numberOfLines={1}>{item.author}</Text>}
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
  const { colors } = useTheme()
  if (status === 'completed') {
    return <Text style={[styles.statusBadge, { color: colors.success }]}>{chapterCount} chapters</Text>
  }
  if (status === 'failed') {
    return <Text style={[styles.statusBadge, { color: colors.error }]}>Processing failed</Text>
  }
  return <Text style={[styles.statusBadge, { color: colors.primary }]}>Processing...</Text>
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 8 },
  emptyTitle: { fontFamily: fonts.serifBold, fontSize: 22, marginTop: 8 },
  emptyText: { fontFamily: fonts.sans, fontSize: 15, textAlign: 'center' },
  emptySubtext: { fontFamily: fonts.sans, fontSize: 13, textAlign: 'center' },
  signInBtn: { marginTop: 12, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 10 },
  signInText: { color: '#fff', fontFamily: fonts.sansMedium, fontSize: 15 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabText: { fontFamily: fonts.sansMedium, fontSize: 14 },
  listContent: { paddingBottom: 20 },
  skeletonList: { padding: 12 },
  bookRow: { flexDirection: 'row', padding: 14, borderBottomWidth: 1 },
  coverWrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cover: { width: 70, height: 105, borderRadius: 6 },
  bookInfo: { flex: 1, marginLeft: 14, justifyContent: 'center' },
  bookTitle: { fontFamily: fonts.sansMedium, fontSize: 15 },
  bookAuthor: { fontFamily: fonts.sans, fontSize: 13, marginTop: 2 },
  chapterCount: { fontFamily: fonts.sans, fontSize: 12, marginTop: 6 },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  progressText: { fontFamily: fonts.sans, fontSize: 11, width: 32 },
  continueBtn: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  continueBtnText: { color: '#fff', fontFamily: fonts.sansMedium, fontSize: 13 },
  uploadBtn: {
    margin: 14,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  uploadBtnText: { fontFamily: fonts.sansMedium, fontSize: 15 },
  statusBadge: { fontFamily: fonts.sans, fontSize: 12, marginTop: 6 },
})
