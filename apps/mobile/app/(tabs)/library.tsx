import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, useWindowDimensions,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Image } from 'expo-image'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  libraryApi, readingProgressApi, userBooksApi, reviewsApi, getStorageUrl, createBooksApi,
} from '@textstack/shared'
import type { UserLibraryItem, UserBookDto, ReadingProgressDto, UserRatingDto } from '@textstack/shared'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme } from '../../src/context/ThemeContext'
import { useLanguage } from '../../src/context/LanguageContext'
import { fonts } from '../../src/theme/typography'
import { SkeletonLoader } from '../../src/components/ui/SkeletonLoader'
import { EmptyState } from '../../src/components/ui/EmptyState'

type Tab = 'saved' | 'uploads' | 'reviews'
type ViewMode = 'list' | 'grid'


const VIEW_MODE_KEY = 'textstack_library_view'

export default function LibraryScreen() {
  const { isAuthenticated, user } = useAuth()
  const { colors } = useTheme()
  const { t } = useLanguage()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('saved')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [library, setLibrary] = useState<UserLibraryItem[]>([])
  const [userBooks, setUserBooks] = useState<UserBookDto[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, ReadingProgressDto>>({})
  const [reviews, setReviews] = useState<UserRatingDto[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadData = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return }
    try {
      const [lib, progress, books, ratings] = await Promise.all([
        libraryApi.getLibrary(),
        readingProgressApi.getAllProgress(),
        userBooksApi.getUserBooks(),
        reviewsApi.getAllRatings().catch(() => [] as UserRatingDto[]),
      ])
      setLibrary(lib)
      setUserBooks(books)
      setReviews(ratings.filter(r => r.reviewText))
      const map: Record<string, ReadingProgressDto> = {}
      for (const p of progress) map[p.editionId] = p
      setProgressMap(map)
    } catch (e) {
      console.error('Library load error:', e)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])


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

  // Persist view mode
  useEffect(() => {
    AsyncStorage.getItem(VIEW_MODE_KEY).then(v => { if (v === 'grid' || v === 'list') setViewMode(v) }).catch(() => {})
  }, [])
  const toggleView = (mode: ViewMode) => { setViewMode(mode); AsyncStorage.setItem(VIEW_MODE_KEY, mode).catch(() => {}) }

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
        <EmptyState
          icon="library-outline"
          title={t('library.title')}
          subtitle={t('library.signInPrompt')}
          buttonLabel="Sign In"
          onButtonPress={() => router.push('/(auth)/login')}
        />
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
      {user?.email && (
        <Text style={[styles.emailText, { color: colors.textSecondary }]}>{user.email}</Text>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={[styles.tabs, { flex: 1, borderBottomWidth: 0 }]}>
          {([['saved', `Saved (${library.length})`], ['uploads', `Uploads (${userBooks.length})`], ['reviews', `Reviews (${reviews.length})`]] as [Tab, string][]).map(([t, label]) => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.textSecondary }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {tab !== 'reviews' && (
          <View style={{ flexDirection: 'row', paddingRight: 10, gap: 2 }}>
            <TouchableOpacity onPress={() => toggleView('grid')} hitSlop={6} style={{ padding: 4 }}>
              <Ionicons name="grid-outline" size={18} color={viewMode === 'grid' ? colors.primary : colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => toggleView('list')} hitSlop={6} style={{ padding: 4 }}>
              <Ionicons name="list-outline" size={18} color={viewMode === 'list' ? colors.primary : colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {tab === 'saved' ? (
        <SavedList library={library} setLibrary={setLibrary} progressMap={progressMap} setProgressMap={setProgressMap} refreshing={refreshing} onRefresh={onRefresh} viewMode={viewMode} />
      ) : tab === 'uploads' ? (
        <UploadsList books={userBooks} refreshing={refreshing} onRefresh={onRefresh} viewMode={viewMode} />
      ) : (
        <ReviewsList reviews={reviews} refreshing={refreshing} onRefresh={onRefresh} />
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

function SavedList({ library, setLibrary, progressMap, setProgressMap, refreshing, onRefresh, viewMode }: {
  library: UserLibraryItem[]; setLibrary: React.Dispatch<React.SetStateAction<UserLibraryItem[]>>; progressMap: Record<string, ReadingProgressDto>; setProgressMap: React.Dispatch<React.SetStateAction<Record<string, ReadingProgressDto>>>; refreshing: boolean; onRefresh: () => void; viewMode: ViewMode
}) {
  const router = useRouter()
  const { colors } = useTheme()
  const { language, t } = useLanguage()
  const { width } = useWindowDimensions()
  const [sort, setSort] = useState<SavedSort>('recent')
  const numColumns = viewMode === 'grid' ? Math.floor(width / 130) : 1

  const handleAction = (item: UserLibraryItem) => {
    const progress = progressMap[item.editionId]
    const isRead = progress?.percent === 1
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = []

    buttons.push({
      text: isRead ? 'Mark as unread' : 'Mark as read',
      onPress: async () => {
        try {
          const api = createBooksApi(language)
          const book = await api.getBook(item.slug)
          if (book.chapters.length === 0) return
          const ch = isRead ? book.chapters[0] : book.chapters[book.chapters.length - 1]
          await readingProgressApi.updateProgress(item.editionId, {
            chapterId: ch.id,
            chapterSlug: ch.slug,
            progress: isRead ? 0 : 1,
          })
          setProgressMap(prev => ({
            ...prev,
            [item.editionId]: { ...prev[item.editionId], editionId: item.editionId, percent: isRead ? 0 : 1, chapterSlug: ch.slug, updatedAt: new Date().toISOString() },
          }))
        } catch {}
      },
    })

    buttons.push({
      text: 'Remove from Library', style: 'destructive',
      onPress: async () => {
        try {
          await libraryApi.removeFromLibrary(item.editionId)
          setLibrary(prev => prev.filter(l => l.editionId !== item.editionId))
        } catch {}
      },
    })

    buttons.push({ text: 'Cancel', style: 'cancel' })
    Alert.alert(item.title, undefined, buttons)
  }

  if (library.length === 0) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="book-outline"
          title={t('library.emptyLibrary')}
          subtitle={t('library.browseBooks')}
          buttonLabel={t('library.browseBooks')}
          onButtonPress={() => router.push('/(tabs)/search')}
        />
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
      <FlatList
        key={viewMode}
        data={sorted}
        numColumns={viewMode === 'grid' ? numColumns : 1}
        keyExtractor={item => item.editionId}
        ListHeaderComponent={
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
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={viewMode === 'grid' ? styles.gridContent : styles.listContent}
        columnWrapperStyle={viewMode === 'grid' ? { gap: 10 } : undefined}
        renderItem={({ item }) => {
          const progress = progressMap[item.editionId]
          const pct = progress?.percent ? Math.round(progress.percent * 100) : 0
          const continueSlug = progress?.chapterSlug
          const lastRead = progress?.updatedAt

          if (viewMode === 'grid') {
            const cardWidth = (width - 20 - (numColumns - 1) * 10) / numColumns
            return (
              <TouchableOpacity
                style={{ width: cardWidth, marginBottom: 14 }}
                onPress={() => router.push(`/book/${item.slug}`)}
                onLongPress={() => handleAction(item)}
                activeOpacity={0.85}
              >
                <Image
                  source={item.coverPath ? getStorageUrl(item.coverPath) : undefined}
                  style={[styles.gridCover, { backgroundColor: colors.border }]}
                  contentFit="cover"
                />
                {pct >= 100 && (
                  <View style={[styles.gridBadge, { backgroundColor: colors.success }]}>
                    <Ionicons name="checkmark" size={10} color="#fff" />
                  </View>
                )}
                {pct > 0 && pct < 100 && (
                  <View style={[styles.gridProgressTrack, { backgroundColor: colors.border }]}>
                    <View style={[styles.gridProgressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                  </View>
                )}
                <Text style={[styles.gridTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
              </TouchableOpacity>
            )
          }

          return (
            <TouchableOpacity
              style={[styles.bookRow, { borderBottomColor: colors.border }]}
              onPress={() => router.push(`/book/${item.slug}`)}
              onLongPress={() => handleAction(item)}
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
                {pct >= 100 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                    <Text style={{ fontSize: 12, color: colors.success, fontFamily: fonts.sansMedium }}>Read</Text>
                  </View>
                ) : pct > 0 ? (
                  <View style={styles.progressRow}>
                    <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                    </View>
                    <Text style={[styles.progressText, { color: colors.textSecondary }]}>{pct}%</Text>
                  </View>
                ) : null}
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
  )
}

type UploadSort = 'recent' | 'title' | 'progress'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function UploadsList({ books, refreshing, onRefresh, viewMode }: {
  books: UserBookDto[]; refreshing: boolean; onRefresh: () => void; viewMode: ViewMode
}) {
  const router = useRouter()
  const { colors } = useTheme()
  const { t } = useLanguage()
  const { width } = useWindowDimensions()
  const [sort, setSort] = useState<UploadSort>('recent')
  const [quota, setQuota] = useState<{ usedBytes: number; limitBytes: number } | null>(null)
  const numColumns = viewMode === 'grid' ? Math.floor(width / 130) : 1

  useEffect(() => {
    userBooksApi.getStorageQuota().then(setQuota).catch(() => {})
  }, [books.length])

  const handleBookAction = (item: UserBookDto) => {
    const s = item.status.toLowerCase()
    const isReady = s === 'ready' || s === 'completed'
    const isFailed = s === 'failed'
    const isProcessing = !isReady && !isFailed

    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = []

    if (isReady) {
      buttons.push({ text: 'View Details', onPress: () => router.push(`/my-books/${item.id}`) })
      if (!item.completedAt) {
        buttons.push({
          text: 'Mark as Read', onPress: async () => {
            try { await userBooksApi.markUserBookComplete(item.id); onRefresh() } catch {}
          },
        })
      } else {
        buttons.push({
          text: 'Mark as Unread', onPress: async () => {
            try { await userBooksApi.unmarkUserBookComplete(item.id); onRefresh() } catch {}
          },
        })
      }
    }
    if (isFailed) {
      buttons.push({
        text: 'Retry', onPress: async () => {
          try { await userBooksApi.retryUserBook(item.id); onRefresh() } catch {}
        },
      })
    }
    if (isProcessing) {
      buttons.push({
        text: 'Cancel', style: 'destructive', onPress: async () => {
          try { await userBooksApi.cancelUserBook(item.id); onRefresh() } catch {}
        },
      })
    }
    buttons.push({
      text: 'Delete', style: 'destructive', onPress: () => {
        Alert.alert('Delete Book', `Delete "${item.title || 'Untitled'}"? This cannot be undone.`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete', style: 'destructive', onPress: async () => {
              try { await userBooksApi.deleteUserBook(item.id); onRefresh() } catch {}
            },
          },
        ])
      },
    })
    buttons.push({ text: 'Cancel', style: 'cancel' })

    Alert.alert(item.title || 'Untitled', undefined, buttons)
  }

  const sorted = [...books].sort((a, b) => {
    if (sort === 'title') return (a.title || '').localeCompare(b.title || '')
    if (sort === 'progress') return (b.progressPercent ?? 0) - (a.progressPercent ?? 0)
    if (sort === 'recent') {
      const aDate = a.progressUpdatedAt || a.createdAt
      const bDate = b.progressUpdatedAt || b.createdAt
      return new Date(bDate).getTime() - new Date(aDate).getTime()
    }
    return 0
  })

  const listHeader = (
    <>
      <TouchableOpacity
        style={[styles.uploadBtn, { borderColor: colors.primary }]}
        onPress={() => router.push('/my-books/upload')}
      >
        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
        <Text style={[styles.uploadBtnText, { color: colors.primary }]}>Upload Book</Text>
      </TouchableOpacity>

      {quota && quota.limitBytes > 0 && (
        <View style={styles.quotaRow}>
          <View style={[styles.quotaTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.quotaFill, { width: `${Math.min((quota.usedBytes / quota.limitBytes) * 100, 100)}%`, backgroundColor: colors.primary }]} />
          </View>
          <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.textSecondary }}>
            {formatBytes(quota.usedBytes)} / {formatBytes(quota.limitBytes)}
          </Text>
        </View>
      )}

      {books.length > 1 && (
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
      )}
    </>
  )

  if (sorted.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        {listHeader}
        <View style={styles.center}>
          <EmptyState
            icon="cloud-upload-outline"
            title={t('library.noUploads')}
            subtitle={t('library.uploadHint')}
          />
        </View>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        key={viewMode}
        data={sorted}
        numColumns={viewMode === 'grid' ? numColumns : 1}
        keyExtractor={item => item.id}
        ListHeaderComponent={listHeader}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={viewMode === 'grid' ? styles.gridContent : styles.listContent}
        columnWrapperStyle={viewMode === 'grid' ? { gap: 10 } : undefined}
          renderItem={({ item }) => {
            const s = item.status.toLowerCase()
            const isReady = s === 'ready' || s === 'completed'
            const isFailed = s === 'failed'
            const isProcessing = !isReady && !isFailed
            const pct = item.progressPercent ? Math.round(item.progressPercent * 100) : 0

            if (viewMode === 'grid') {
              const cardWidth = (width - 20 - (numColumns - 1) * 10) / numColumns
              return (
                <TouchableOpacity
                  style={{ width: cardWidth, marginBottom: 14 }}
                  onPress={() => { if (isReady) router.push(`/my-books/${item.id}`) }}
                  onLongPress={() => handleBookAction(item)}
                  activeOpacity={0.85}
                >
                  <View>
                    <Image
                      source={item.coverPath ? getStorageUrl(item.coverPath) : undefined}
                      style={[styles.gridCover, { backgroundColor: colors.border }]}
                      contentFit="cover"
                    />
                    {isProcessing && (
                      <View style={[styles.processingOverlay, { borderRadius: 8 }]}>
                        <Ionicons name="sync-outline" size={20} color="#fff" />
                      </View>
                    )}
                    {isReady && item.completedAt && (
                      <View style={[styles.gridBadge, { backgroundColor: colors.success }]}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    )}
                    {isFailed && (
                      <View style={[styles.gridBadge, { backgroundColor: colors.error }]}>
                        <Ionicons name="alert" size={10} color="#fff" />
                      </View>
                    )}
                  </View>
                  {pct > 0 && pct < 100 && (
                    <View style={[styles.gridProgressTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.gridProgressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                    </View>
                  )}
                  <Text style={[styles.gridTitle, { color: isReady ? colors.text : colors.textSecondary }]} numberOfLines={2}>
                    {item.title || 'Untitled'}
                  </Text>
                </TouchableOpacity>
              )
            }

            return (
              <TouchableOpacity
                style={[styles.bookRow, { borderBottomColor: colors.border }]}
                onPress={() => { if (isReady) router.push(`/my-books/${item.id}`) }}
                onLongPress={() => handleBookAction(item)}
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

                  {isReady && item.completedAt && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: colors.success }}>Read</Text>
                    </View>
                  )}

                  {isReady && !item.completedAt && pct > 0 && (
                    <View style={styles.progressRow}>
                      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                      </View>
                      <Text style={[styles.progressText, { color: colors.textSecondary }]}>{pct}%</Text>
                    </View>
                  )}

                  {!item.completedAt && <StatusBadge status={item.status} chapterCount={item.chapterCount} createdAt={item.createdAt} />}
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
    </View>
  )
}

function ReviewsList({ reviews, refreshing, onRefresh }: {
  reviews: UserRatingDto[]; refreshing: boolean; onRefresh: () => void
}) {
  const router = useRouter()
  const { colors } = useTheme()
  const { t } = useLanguage()

  const handleLongPress = (item: UserRatingDto) => {
    const editionId = item.editionId
    const userBookId = item.userBookId
    const buttons: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = []
    if (item.editionSlug) {
      buttons.push({ text: 'Edit Review', onPress: () => router.push(`/book/${item.editionSlug}`) })
    }
    buttons.push({
      text: 'Delete Review',
      style: 'destructive',
      onPress: () => {
        Alert.alert('Delete Review', 'Are you sure?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete', style: 'destructive', onPress: async () => {
              try {
                if (editionId) await reviewsApi.deleteReview(editionId)
                else if (userBookId) await reviewsApi.deleteUserBookRating(userBookId)
                onRefresh()
              } catch (e) { console.error('Delete review failed:', e) }
            },
          },
        ])
      },
    })
    buttons.push({ text: 'Cancel', style: 'cancel' })
    Alert.alert('Review Options', undefined, buttons)
  }

  if (reviews.length === 0) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="star-outline"
          title={t('library.noReviews')}
          subtitle={t('library.browseBooks')}
          buttonLabel={t('library.browseBooks')}
          onButtonPress={() => router.push('/(tabs)/search')}
        />
      </View>
    )
  }

  return (
    <FlatList
      data={reviews}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => {
        const stars = '★'.repeat(Math.round(item.rating)) + '☆'.repeat(5 - Math.round(item.rating))
        return (
          <TouchableOpacity
            style={[styles.bookRow, { borderBottomColor: colors.border }]}
            onPress={() => {
              if (item.editionSlug && item.editionLanguage) router.push(`/book/${item.editionSlug}`)
            }}
            onLongPress={() => handleLongPress(item)}
            activeOpacity={0.85}
          >
            <View style={styles.coverWrapper}>
              <Image
                source={item.editionCoverPath ? getStorageUrl(item.editionCoverPath) : undefined}
                style={[styles.cover, { backgroundColor: colors.border }]}
                contentFit="cover"
              />
            </View>
            <View style={styles.bookInfo}>
              <Text style={[styles.bookTitle, { color: colors.text }]} numberOfLines={2}>
                {item.editionTitle || item.userBookTitle || 'Unknown Book'}
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: '#F59E0B', marginTop: 4 }}>{stars}</Text>
              {item.title && (
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: colors.text, marginTop: 4 }} numberOfLines={1}>
                  {item.title}
                </Text>
              )}
              {item.reviewText && (
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.textSecondary, marginTop: 4, lineHeight: 18 }} numberOfLines={3}>
                  {item.reviewText}
                </Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="thumbs-up-outline" size={12} color={colors.textSecondary} />
                  <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.textSecondary }}>{item.helpfulCount}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="chatbubble-outline" size={12} color={colors.textSecondary} />
                  <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.textSecondary }}>{item.commentCount}</Text>
                </View>
                <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.textSecondary }}>
                  {new Date(item.updatedAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )
      }}
    />
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
  emailText: { fontFamily: fonts.sans, fontSize: 12, textAlign: 'center', paddingTop: 8, paddingBottom: 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 8 },
  emptyTitle: { fontFamily: fonts.serifBold, fontSize: 22, marginTop: 8 },
  emptyText: { fontFamily: fonts.sans, fontSize: 15, textAlign: 'center' },
  emptySubtext: { fontFamily: fonts.sans, fontSize: 13, textAlign: 'center' },
  browseButton: { marginTop: 12, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 10 },
  browseButtonText: { color: '#fff', fontFamily: fonts.sansMedium, fontSize: 15 },
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
  quotaRow: { paddingHorizontal: 14, marginBottom: 8, alignItems: 'center', gap: 4 },
  quotaTrack: { height: 4, borderRadius: 2, overflow: 'hidden', width: '100%' },
  quotaFill: { height: '100%', borderRadius: 2 },
  savedSortRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
  savedSortChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  // Grid styles
  gridContent: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 20 },
  gridCover: { width: '100%', aspectRatio: 2 / 3, borderRadius: 8 },
  gridTitle: { fontFamily: fonts.sansMedium, fontSize: 12, marginTop: 4 },
  gridBadge: {
    position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9,
    justifyContent: 'center', alignItems: 'center',
  },
  gridProgressTrack: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  gridProgressFill: { height: '100%', borderRadius: 2 },
})
