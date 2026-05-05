import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ScrollView, useWindowDimensions,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Image } from 'expo-image'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  libraryApi, readingProgressApi, userBooksApi, getStorageUrl,
} from '@textstack/shared'
import { getAnonymousReaderName, type UserLibraryItem, type UserBookDto, type ReadingProgressDto } from '@textstack/shared'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme } from '../../src/context/ThemeContext'
import { useLanguage } from '../../src/context/LanguageContext'
import { useToast } from '../../src/context/ToastContext'
import { AddToCollectionSheet } from '../../src/components/library/AddToCollectionSheet'
import { fonts } from '../../src/theme/typography'
import { SkeletonLoader } from '../../src/components/ui/SkeletonLoader'
import { EmptyState } from '../../src/components/ui/EmptyState'
import { LibraryShelves } from '../../src/components/library/LibraryShelves'
import { LibrarySidebarDrawer, type LibrarySource } from '../../src/components/library/LibrarySidebarDrawer'
import { BookStatusBadge } from '../../src/components/library/BookStatusBadge'
import { GeneratedCover } from '../../src/components/library/GeneratedCover'
import { useLibrarySort, sortLibraryItems, sortUserBooks, type LibrarySortKey } from '../../src/hooks/useLibrarySort'
import {
  filterLibraryItems, filterUserBooks, countsForLibrary, countsForUploads,
} from '../../src/hooks/useLibraryFilter'
import { LibraryStatusTabs } from '../../src/components/library/LibraryStatusTabs'
import { useLibraryStatus } from '../../src/hooks/useLibraryStatus'
import { useLibrarySearch } from '../../src/hooks/useLibrarySearch'
import { matchesQuery } from '../../src/lib/searchUtils'
import { LibrarySearch } from '../../src/components/library/LibrarySearch'
import { useBookActions } from '../../src/hooks/useBookActions'

const NEW_BADGE_TTL_MS = 24 * 60 * 60 * 1000
const isNewUpload = (createdAt?: string): boolean => {
  if (!createdAt) return false
  const ts = Date.parse(createdAt)
  if (Number.isNaN(ts)) return false
  return Date.now() - ts < NEW_BADGE_TTL_MS
}

type Tab = 'saved' | 'uploads'
type ViewMode = 'list' | 'grid'


const VIEW_MODE_KEY = 'textstack_library_view'

export default function LibraryScreen() {
  const { isAuthenticated, user } = useAuth()
  const { colors } = useTheme()
  const { t } = useLanguage()
  const { show: showToast } = useToast()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('saved')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [source, setSource] = useState<LibrarySource>('all')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [library, setLibrary] = useState<UserLibraryItem[]>([])
  const [userBooks, setUserBooks] = useState<UserBookDto[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, ReadingProgressDto>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Generation counter guards against:
  //  1. Out-of-order resolution — pull-to-refresh racing a focus-effect
  //     reload; the slower response would otherwise overwrite fresher data.
  //  2. Set-state-after-unmount — tab swap during an in-flight request.
  // Set to -1 on unmount so trailing resolutions are dropped (B-10).
  const loadGenRef = useRef(0)
  useEffect(() => () => { loadGenRef.current = -1 }, [])

  const loadData = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return }
    const myGen = ++loadGenRef.current
    try {
      const [lib, progress, books] = await Promise.all([
        libraryApi.getLibrary(),
        readingProgressApi.getAllProgress(),
        userBooksApi.getUserBooks(),
      ])
      if (myGen !== loadGenRef.current) return // superseded or unmounted
      setLibrary(lib)
      setUserBooks(books)
      const map: Record<string, ReadingProgressDto> = {}
      for (const p of progress) map[p.editionId] = p
      setProgressMap(map)
    } catch (e) {
      if (myGen !== loadGenRef.current) return
      console.error('Library load error:', e)
    } finally {
      if (myGen === loadGenRef.current) setLoading(false)
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
      } catch (e) {
        // Don't toast here — polling errors should stay quiet, otherwise a
        // flaky connection would spam the user once every 5s. Just log.
        console.warn('Library user-books poll failed:', e)
      }
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

  const effectiveTab: Tab = source === 'uploads' ? 'uploads'
    : source === 'catalog' ? 'saved'
    : tab
  const showTabs = source === 'all'

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.sidebarHeader}>
        <TouchableOpacity onPress={() => setDrawerOpen(true)} hitSlop={10} style={styles.menuBtn}>
          <Ionicons name="menu" size={20} color={colors.text} />
          <Text style={[styles.menuBtnText, { color: colors.text }]}>{t('library.sidebar.open')}</Text>
        </TouchableOpacity>
      </View>
      {user && (
        <Text style={[styles.emailText, { color: colors.textSecondary }]}>
          {user.isGuest ? getAnonymousReaderName(user.id) : user.email}
        </Text>
      )}
      <LibraryShelves hasAnyContent={library.length > 0 || userBooks.length > 0} />
      <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {showTabs && (
          <View style={[styles.tabs, { flex: 1, borderBottomWidth: 0 }]}>
            {([['saved', `Saved (${library.length})`], ['uploads', `Uploads (${userBooks.length})`]] as [Tab, string][]).map(([t, label]) => (
              <TouchableOpacity
                key={t}
                style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.textSecondary }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {!showTabs && <View style={{ flex: 1 }} />}
        <View style={{ flexDirection: 'row', paddingRight: 10, gap: 2 }}>
          <TouchableOpacity onPress={() => toggleView('grid')} hitSlop={6} style={{ padding: 4 }}>
            <Ionicons name="grid-outline" size={18} color={viewMode === 'grid' ? colors.primary : colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => toggleView('list')} hitSlop={6} style={{ padding: 4 }}>
            <Ionicons name="list-outline" size={18} color={viewMode === 'list' ? colors.primary : colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {effectiveTab === 'saved' ? (
        <SavedList library={library} setLibrary={setLibrary} progressMap={progressMap} setProgressMap={setProgressMap} refreshing={refreshing} onRefresh={onRefresh} viewMode={viewMode} />
      ) : (
        <UploadsList books={userBooks} refreshing={refreshing} onRefresh={onRefresh} viewMode={viewMode} />
      )}
      <LibrarySidebarDrawer
        visible={drawerOpen}
        source={source}
        counts={{ all: library.length + userBooks.length, uploads: userBooks.length, catalog: library.length }}
        onSelect={(next) => {
          setSource(next)
          if (next === 'uploads') setTab('uploads')
          else if (next === 'catalog') setTab('saved')
        }}
        onClose={() => setDrawerOpen(false)}
      />
    </View>
  )
}

const SORT_KEYS: LibrarySortKey[] = ['recent', 'added', 'title', 'author', 'progress']

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
  const { t } = useLanguage()
  const { show: showToast } = useToast()
  const { width } = useWindowDimensions()
  const { sort, setSort } = useLibrarySort('saved')
  const { status: filter, setStatus: setFilter } = useLibraryStatus()
  const { query, debouncedQuery, setQuery, clear: clearQuery } = useLibrarySearch('saved')
  const counts = countsForLibrary(library, progressMap)
  const numColumns = viewMode === 'grid' ? Math.floor(width / 130) : 1
  const { showSavedActions } = useBookActions()
  const [collectionTarget, setCollectionTarget] = useState<UserLibraryItem | null>(null)

  const handleAction = (item: UserLibraryItem) =>
    showSavedActions(item, {
      progressMap, setLibrary, setProgressMap, library,
      onAddToCollection: () => setCollectionTarget(item),
    })

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

  const filtered = filterLibraryItems(library, filter, progressMap)
  const searched = debouncedQuery ? filtered.filter(i => matchesQuery({ title: i.title }, debouncedQuery)) : filtered
  const sorted = sortLibraryItems(searched, sort, progressMap)

  return (
    <>
      <FlatList
        key={viewMode}
        data={sorted}
        numColumns={viewMode === 'grid' ? numColumns : 1}
        keyExtractor={item => item.editionId}
        ListHeaderComponent={
          <View>
            <LibrarySearch value={query} onChange={setQuery} onClear={clearQuery} />
            <LibraryStatusTabs value={filter} onChange={setFilter} counts={counts} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedSortRow}>
              {SORT_KEYS.map(key => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setSort(key)}
                  style={[styles.savedSortChip, sort === key && { backgroundColor: colors.primaryLight }]}
                >
                  <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: sort === key ? colors.primary : colors.textSecondary }}>{t(`library.sort.${key}`)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {sorted.length === 0 && (
              <View style={styles.filterEmpty}>
                <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}>
                  {debouncedQuery ? t('library.search.empty').replace('{query}', debouncedQuery) : t('library.filter.empty')}
                </Text>
                <TouchableOpacity
                  onPress={() => { if (debouncedQuery) clearQuery(); else setFilter('all') }}
                  style={[styles.filterEmptyBtn, { borderColor: colors.border }]}
                >
                  <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: colors.text }}>
                    {debouncedQuery ? t('library.search.clear') : t('library.filter.clear')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
              <View style={{ width: cardWidth, marginBottom: 14, position: 'relative' }}>
                <TouchableOpacity
                  onPress={() => router.push(`/book/${item.slug}`)}
                  onLongPress={() => handleAction(item)}
                  activeOpacity={0.85}
                >
                  {item.coverPath ? (
                    <Image
                      source={getStorageUrl(item.coverPath)}
                      style={styles.gridCover}
                      contentFit="cover"
                    />
                  ) : (
                    <GeneratedCover title={item.title} style={styles.gridCover} />
                  )}
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
                  {item.author && (
                    <Text style={[styles.bookAuthor, { color: colors.textSecondary }]} numberOfLines={1}>{item.author}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.gridDotsBtn, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
                  onPress={() => handleAction(item)}
                  hitSlop={8}
                  accessibilityLabel={t('library.actions.menu')}
                >
                  <Ionicons name="ellipsis-vertical" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            )
          }

          return (
            <View style={[styles.bookRow, { borderBottomColor: colors.border }]}>
              <TouchableOpacity
                style={{ flexDirection: 'row', flex: 1 }}
                onPress={() => router.push(`/book/${item.slug}`)}
                onLongPress={() => handleAction(item)}
                activeOpacity={0.85}
              >
                <View style={styles.coverWrapper}>
                  {item.coverPath ? (
                    <Image
                      source={getStorageUrl(item.coverPath)}
                      style={styles.cover}
                      contentFit="cover"
                    />
                  ) : (
                    <GeneratedCover title={item.title} style={styles.cover} />
                  )}
                </View>
                <View style={styles.bookInfo}>
                  <Text style={[styles.bookTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
                  {item.author && (
                    <Text style={[styles.bookAuthor, { color: colors.textSecondary }]} numberOfLines={1}>{item.author}</Text>
                  )}
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
              <TouchableOpacity
                style={styles.rowDotsBtn}
                onPress={() => handleAction(item)}
                hitSlop={10}
                accessibilityLabel={t('library.actions.menu')}
              >
                <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )
        }}
      />
      <AddToCollectionSheet
        visible={!!collectionTarget}
        bookId={collectionTarget?.editionId ?? null}
        bookType="savedbook"
        onClose={() => setCollectionTarget(null)}
        onAdded={(name) => showToast({ message: t('library.actions.addedToCollection').replace('{{name}}', name), variant: 'success' })}
      />
    </>
  )
}

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
  const { show: showToast } = useToast()
  const { width } = useWindowDimensions()
  const { sort, setSort } = useLibrarySort('uploads')
  const { status: filter, setStatus: setFilter } = useLibraryStatus()
  const { query, debouncedQuery, setQuery, clear: clearQuery } = useLibrarySearch('uploads')
  const counts = countsForUploads(books)
  const [quota, setQuota] = useState<{ usedBytes: number; limitBytes: number } | null>(null)
  const numColumns = viewMode === 'grid' ? Math.floor(width / 130) : 1

  // Re-fetch quota when the books count changes — deleting/uploading flips
  // usedBytes, and users checking the quota bar expect it to update without
  // a manual pull-to-refresh.
  useEffect(() => {
    userBooksApi.getStorageQuota().then(setQuota).catch(e =>
      console.warn('Storage quota fetch failed:', e),
    )
  }, [books.length])

  const { showUploadActions } = useBookActions()
  const [collectionTarget, setCollectionTarget] = useState<UserBookDto | null>(null)
  const handleBookAction = (item: UserBookDto) =>
    showUploadActions(item, {
      onChange: onRefresh,
      openDetails: (id) => router.push(`/my-books/${id}`),
      onAddToCollection: () => setCollectionTarget(item),
    })

  const runAction = async (fn: () => Promise<unknown>, label: string) => {
    try {
      await fn()
      onRefresh()
    } catch (e) {
      console.warn(`${label} failed:`, e)
      showToast({ message: `${label} failed. Try again.`, variant: 'error' })
    }
  }

  const filtered = filterUserBooks(books, filter)
  const searched = debouncedQuery ? filtered.filter(b => matchesQuery({ title: b.title, author: b.author }, debouncedQuery)) : filtered
  const sorted = sortUserBooks(searched, sort)

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

      {books.length > 0 && (
        <>
          <LibrarySearch value={query} onChange={setQuery} onClear={clearQuery} />
          <LibraryStatusTabs value={filter} onChange={setFilter} counts={counts} />
        </>
      )}

      {books.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedSortRow}>
          {SORT_KEYS.map(key => (
            <TouchableOpacity
              key={key}
              onPress={() => setSort(key)}
              style={[styles.savedSortChip, sort === key && { backgroundColor: colors.primaryLight }]}
            >
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: sort === key ? colors.primary : colors.textSecondary }}>{t(`library.sort.${key}`)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </>
  )

  if (sorted.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        {listHeader}
        {books.length === 0 ? (
          <View style={styles.center}>
            <EmptyState
              icon="cloud-upload-outline"
              title={t('library.noUploads')}
              subtitle={t('library.uploadHint')}
            />
          </View>
        ) : (
          <View style={styles.filterEmpty}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}>
              {debouncedQuery ? t('library.search.empty').replace('{query}', debouncedQuery) : t('library.filter.empty')}
            </Text>
            <TouchableOpacity
              onPress={() => { if (debouncedQuery) clearQuery(); else setFilter('all') }}
              style={[styles.filterEmptyBtn, { borderColor: colors.border }]}
            >
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: colors.text }}>
                {debouncedQuery ? t('library.search.clear') : t('library.filter.clear')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
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
              const showNew = isReady && !item.completedAt && isNewUpload(item.createdAt)
              return (
                <View style={{ width: cardWidth, marginBottom: 14, position: 'relative' }}>
                  <TouchableOpacity
                    onPress={() => { if (isReady) router.push(`/my-books/${item.id}`) }}
                    onLongPress={() => handleBookAction(item)}
                    activeOpacity={0.85}
                  >
                    <View>
                      {item.coverPath ? (
                        <Image
                          source={getStorageUrl(item.coverPath)}
                          style={styles.gridCover}
                          contentFit="cover"
                        />
                      ) : (
                        <GeneratedCover title={item.title || 'Untitled'} author={item.author} style={styles.gridCover} />
                      )}
                      {isReady && item.completedAt && (
                        <View style={[styles.gridBadge, { backgroundColor: colors.success }]}>
                          <Ionicons name="checkmark" size={10} color="#fff" />
                        </View>
                      )}
                      {(isProcessing || isFailed || showNew) && (
                        <View style={styles.gridPillSlot}>
                          {isProcessing ? (
                            <BookStatusBadge variant="processing" />
                          ) : isFailed ? (
                            <BookStatusBadge variant="failed" onPress={() => runAction(() => userBooksApi.retryUserBook(item.id), 'Retry')} title={item.errorMessage || 'Tap to retry'} />
                          ) : (
                            <BookStatusBadge variant="new" />
                          )}
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
                  <TouchableOpacity
                    style={[styles.gridDotsBtn, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
                    onPress={() => handleBookAction(item)}
                    hitSlop={8}
                    accessibilityLabel={t('library.actions.menu')}
                  >
                    <Ionicons name="ellipsis-vertical" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              )
            }

            return (
              <View style={[styles.bookRow, { borderBottomColor: colors.border }]}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', flex: 1 }}
                  onPress={() => { if (isReady) router.push(`/my-books/${item.id}`) }}
                  onLongPress={() => handleBookAction(item)}
                  activeOpacity={0.85}
                >
                <View style={styles.coverWrapper}>
                  {item.coverPath ? (
                    <Image
                      source={getStorageUrl(item.coverPath)}
                      style={styles.cover}
                      contentFit="cover"
                    />
                  ) : (
                    <GeneratedCover title={item.title || 'Untitled'} author={item.author} style={styles.cover} />
                  )}
                  {(isProcessing || isFailed || (isReady && !item.completedAt && isNewUpload(item.createdAt))) && (
                    <View style={styles.listPillSlot}>
                      {isProcessing ? (
                        <BookStatusBadge variant="processing" />
                      ) : isFailed ? (
                        <BookStatusBadge variant="failed" />
                      ) : (
                        <BookStatusBadge variant="new" />
                      )}
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
                      onPress={() => runAction(() => userBooksApi.retryUserBook(item.id), 'Retry')}
                    >
                      <Ionicons name="refresh-outline" size={14} color={colors.primary} />
                      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: colors.primary }}>Retry</Text>
                    </TouchableOpacity>
                  )}
                </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rowDotsBtn}
                  onPress={() => handleBookAction(item)}
                  hitSlop={10}
                  accessibilityLabel={t('library.actions.menu')}
                >
                  <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )
          }}
        />
      <AddToCollectionSheet
        visible={!!collectionTarget}
        bookId={collectionTarget?.id ?? null}
        bookType="userbook"
        onClose={() => setCollectionTarget(null)}
        onAdded={(name) => showToast({ message: t('library.actions.addedToCollection').replace('{{name}}', name), variant: 'success' })}
      />
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
  filterEmpty: { padding: 32, alignItems: 'center', gap: 12 },
  filterEmptyBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  // Grid styles
  gridContent: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 20 },
  gridCover: { width: '100%', aspectRatio: 2 / 3, borderRadius: 8 },
  gridTitle: { fontFamily: fonts.sansMedium, fontSize: 12, marginTop: 4 },
  gridBadge: {
    position: 'absolute', top: 4, left: 4, width: 18, height: 18, borderRadius: 9,
    justifyContent: 'center', alignItems: 'center',
  },
  gridPillSlot: { position: 'absolute', top: 4, left: 4 },
  listPillSlot: { position: 'absolute', top: 4, left: 4 },
  gridProgressTrack: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  gridProgressFill: { height: '100%', borderRadius: 2 },
  gridDotsBtn: {
    position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  rowDotsBtn: {
    paddingHorizontal: 10, alignSelf: 'center', justifyContent: 'center',
  },
  sidebarHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingTop: 8,
  },
  menuBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: 10,
  },
  menuBtnText: { fontFamily: fonts.sansMedium, fontSize: 13 },
})
