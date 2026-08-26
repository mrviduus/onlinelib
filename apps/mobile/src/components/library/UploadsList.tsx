import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, ScrollView, useWindowDimensions,
} from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { userBooksApi, getStorageUrl, type UserBookDto } from '@textstack/shared'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { useToast } from '../../context/ToastContext'
import { fonts } from '../../theme/typography'
import { EmptyState } from '../ui/EmptyState'
import { SkeletonLoader } from '../ui/SkeletonLoader'
import { AddToCollectionSheet } from './AddToCollectionSheet'
import { BookStatusBadge } from './BookStatusBadge'
import { GeneratedCover } from './GeneratedCover'
import { LibrarySearch } from './LibrarySearch'
import { LibraryStatusTabs } from './LibraryStatusTabs'
import { useLibrarySort, sortUserBooks } from '../../hooks/useLibrarySort'
import { filterUserBooks, countsForUploads } from '../../hooks/useLibraryFilter'
import { useLibraryStatus } from '../../hooks/useLibraryStatus'
import { useLibrarySearch } from '../../hooks/useLibrarySearch'
import { matchesQuery } from '../../lib/searchUtils'
import { useBookActions } from '../../hooks/useBookActions'
import { styles, SORT_KEYS, type ViewMode } from './shared'

const NEW_BADGE_TTL_MS = 24 * 60 * 60 * 1000
const isNewUpload = (createdAt?: string): boolean => {
  if (!createdAt) return false
  const ts = Date.parse(createdAt)
  if (Number.isNaN(ts)) return false
  return Date.now() - ts < NEW_BADGE_TTL_MS
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function UploadsList({ books, refreshing, onRefresh, viewMode, collectionFilterIds, shelvesHeader }: {
  books: UserBookDto[]; refreshing: boolean; onRefresh: () => void; viewMode: ViewMode; collectionFilterIds: Set<string> | null; shelvesHeader: React.ReactNode
}) {
  const router = useRouter()
  const { colors } = useTheme()
  const { t } = useLanguage()
  const { show: showToast } = useToast()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const bottomPad = 56 + insets.bottom + 24
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
  const collectionFiltered = collectionFilterIds ? searched.filter(b => collectionFilterIds.has(b.id)) : searched
  const sorted = sortUserBooks(collectionFiltered, sort)

  const listHeader = (
    <>
      {shelvesHeader}
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
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomPad }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
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
      </ScrollView>
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
        contentContainerStyle={[viewMode === 'grid' ? styles.gridContent : styles.listContent, { paddingBottom: bottomPad }]}
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

