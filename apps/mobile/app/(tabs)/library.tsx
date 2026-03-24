import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert,
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

type UserBookProgress = { chapterSlug: string | null; percent: number | null }

export default function LibraryScreen() {
  const { isAuthenticated } = useAuth()
  const { colors } = useTheme()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('saved')
  const [library, setLibrary] = useState<UserLibraryItem[]>([])
  const [userBooks, setUserBooks] = useState<UserBookDto[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, ReadingProgressDto>>({})
  const [userBookProgressMap, setUserBookProgressMap] = useState<Record<string, UserBookProgress>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // Fetch progress for ready user books
  useEffect(() => {
    const readyBooks = userBooks.filter(b => b.status.toLowerCase() === 'ready')
    if (readyBooks.length === 0) return
    readyBooks.forEach(async (book) => {
      if (userBookProgressMap[book.id]) return
      try {
        const p = await userBooksApi.getUserBookProgress(book.id)
        if (p) setUserBookProgressMap(prev => ({ ...prev, [book.id]: { chapterSlug: p.chapterSlug, percent: p.percent } }))
      } catch {}
    })
  }, [userBooks])

  // Auto-refresh while processing books exist
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    const hasProcessing = userBooks.some(b => b.status.toLowerCase() === 'processing')
    if (!hasProcessing) return
    pollRef.current = setInterval(async () => {
      try {
        const books = await userBooksApi.getUserBooks()
        setUserBooks(books)
      } catch {}
    }, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [userBooks])

  useEffect(() => { loadData() }, [loadData])

  useFocusEffect(useCallback(() => {
    if (isAuthenticated && !loading) loadData()
  }, [isAuthenticated, loading, loadData]))

  const onRefresh = async () => {
    setRefreshing(true)
    setUserBookProgressMap({})
    await loadData()
    setRefreshing(false)
  }

  if (!isAuthenticated) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="library-outline" size={56} color={colors.textSecondary} />
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
        <SavedList library={library} setLibrary={setLibrary} progressMap={progressMap} refreshing={refreshing} onRefresh={onRefresh} />
      ) : (
        <UploadsList books={userBooks} progressMap={userBookProgressMap} refreshing={refreshing} onRefresh={onRefresh} />
      )}
    </View>
  )
}

type SavedSort = 'recent' | 'title' | 'progress'

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function SavedList({ library, setLibrary, progressMap, refreshing, onRefresh }: {
  library: UserLibraryItem[]; setLibrary: React.Dispatch<React.SetStateAction<UserLibraryItem[]>>; progressMap: Record<string, ReadingProgressDto>; refreshing: boolean; onRefresh: () => void
}) {
  const router = useRouter()
  const { colors } = useTheme()
  const [sort, setSort] = useState<SavedSort>('recent')

  const handleRemove = (item: UserLibraryItem) => {
    Alert.alert('Remove from Library', `Remove "${item.title}" from your library?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await libraryApi.removeFromLibrary(item.editionId)
            setLibrary(prev => prev.filter(l => l.editionId !== item.editionId))
          } catch {}
        },
      },
    ])
  }

  if (library.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="book-outline" size={48} color={colors.textSecondary} />
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No saved books yet</Text>
        <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Browse books and save them to your library</Text>
      </View>
    )
  }

  const sorted = [...library].sort((a, b) => {
    if (sort === 'title') return (a.title || '').localeCompare(b.title || '')
    if (sort === 'progress') {
      const pa = progressMap[a.editionId]?.percent || 0
      const pb = progressMap[b.editionId]?.percent || 0
      return pb - pa
    }
    // recent: sort by last read (updatedAt) if available, then by createdAt
    const aTime = progressMap[a.editionId]?.updatedAt || a.createdAt
    const bTime = progressMap[b.editionId]?.updatedAt || b.createdAt
    return new Date(bTime).getTime() - new Date(aTime).getTime()
  })

  return (
    <>
      <View style={styles.savedSortRow}>
        {([['recent', 'Recent'], ['title', 'Title'], ['progress', 'Progress']] as const).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => setSort(key)}
            style={[styles.savedSortChip, sort === key && { backgroundColor: colors.primaryLight }]}
          >
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: sort === key ? colors.primary : colors.textSecondary }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={sorted}
        keyExtractor={item => item.editionId}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const progress = progressMap[item.editionId]
          const pct = progress?.percent ? Math.round(progress.percent * 100) : 0
          const continueSlug = progress?.chapterSlug
          const lastRead = progress?.updatedAt

          return (
            <TouchableOpacity
              style={[styles.bookRow, { borderBottomColor: colors.border }]}
              onPress={() => router.push(`/book/${item.slug}`)}
              onLongPress={() => handleRemove(item)}
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
                <Text style={[styles.bookTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
                {pct > 0 && (
                  <View style={styles.progressRow}>
                    <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                    </View>
                    <Text style={[styles.progressText, { color: colors.textSecondary }]}>{pct}%</Text>
                  </View>
                )}
                {lastRead && (
                  <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>
                    Last read {formatTimeAgo(lastRead)}
                  </Text>
                )}
                {continueSlug ? (
                  <TouchableOpacity
                    style={[styles.continueBtn, { backgroundColor: colors.primary }]}
                    onPress={() => router.push(`/reader/${item.slug}/${continueSlug}`)}
                  >
                    <Ionicons name="play" size={12} color="#fff" />
                    <Text style={styles.continueBtnText}>Continue</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </TouchableOpacity>
          )
        }}
      />
    </>
  )
}

function UploadsList({ books, progressMap, refreshing, onRefresh }: {
  books: UserBookDto[]; progressMap: Record<string, UserBookProgress>; refreshing: boolean; onRefresh: () => void
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
          <Ionicons name="cloud-upload-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No uploaded books</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Upload EPUB or PDF files to read</Text>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const s = item.status.toLowerCase()
            const isReady = s === 'ready' || s === 'completed'
            const isFailed = s === 'failed'
            const isProcessing = !isReady && !isFailed
            const progress = progressMap[item.id]
            const pct = progress?.percent ? Math.round(progress.percent * 100) : 0

            return (
              <TouchableOpacity
                style={[styles.bookRow, { borderBottomColor: colors.border }]}
                onPress={() => { if (isReady) router.push(`/my-books/${item.id}`) }}
                disabled={!isReady}
                activeOpacity={0.85}
              >
                <View style={styles.coverWrapper}>
                  <Image
                    source={item.coverPath ? getStorageUrl(item.coverPath) : undefined}
                    style={[styles.cover, { backgroundColor: colors.border }]}
                    contentFit="cover"
                  />
                  {isProcessing && (
                    <View style={styles.processingOverlay}>
                      <Ionicons name="sync-outline" size={20} color="#fff" />
                    </View>
                  )}
                </View>
                <View style={styles.bookInfo}>
                  <Text style={[styles.bookTitle, { color: isReady ? colors.text : colors.textSecondary }]} numberOfLines={2}>
                    {item.title || 'Untitled'}
                  </Text>
                  {item.author && <Text style={[styles.bookAuthor, { color: colors.textSecondary }]} numberOfLines={1}>{item.author}</Text>}

                  {isReady && pct > 0 && (
                    <View style={styles.progressRow}>
                      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                      </View>
                      <Text style={[styles.progressText, { color: colors.textSecondary }]}>{pct}%</Text>
                    </View>
                  )}

                  <StatusBadge status={item.status} chapterCount={item.chapterCount} createdAt={item.createdAt} />
                  {isFailed && item.errorMessage && (
                    <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.error, marginTop: 4 }} numberOfLines={2}>
                      {item.errorMessage.substring(0, 80)}{item.errorMessage.length > 80 ? '...' : ''}
                    </Text>
                  )}
                  {isFailed && (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'flex-start' }}
                      onPress={async () => {
                        try {
                          await userBooksApi.retryUserBook(item.id)
                          onRefresh()
                        } catch {}
                      }}
                    >
                      <Ionicons name="refresh-outline" size={14} color={colors.primary} />
                      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: colors.primary }}>Retry</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </View>
  )
}

function StatusBadge({ status, chapterCount, createdAt }: { status: string; chapterCount: number; createdAt?: string }) {
  const { colors } = useTheme()
  const [elapsed, setElapsed] = useState(0)
  const s = status.toLowerCase()
  const isProcessing = s !== 'ready' && s !== 'completed' && s !== 'failed'

  useEffect(() => {
    if (!isProcessing || !createdAt) return
    const startTime = new Date(createdAt).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - startTime) / 1000))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [isProcessing, createdAt])

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s2 = secs % 60
    return `${m}:${s2.toString().padStart(2, '0')}`
  }

  if (s === 'ready' || s === 'completed') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
        <Ionicons name="checkmark-circle" size={14} color={colors.success} />
        <Text style={[styles.statusBadge, { color: colors.success, marginTop: 0 }]}>{chapterCount} chapters</Text>
      </View>
    )
  }
  if (s === 'failed') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
        <Ionicons name="alert-circle" size={14} color={colors.error} />
        <Text style={[styles.statusBadge, { color: colors.error, marginTop: 0 }]}>Processing failed</Text>
      </View>
    )
  }

  const isStuck = elapsed > 30
  return (
    <View style={{ marginTop: 6, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name="sync-outline" size={14} color={colors.primary} />
        <Text style={[styles.statusBadge, { color: colors.primary, marginTop: 0 }]}>
          Processing... {formatElapsed(elapsed)}
        </Text>
      </View>
      {isStuck && (
        <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: '#F59E0B' }}>Possible issue — taking longer than expected</Text>
      )}
    </View>
  )
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
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  savedSortRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
  savedSortChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
})
