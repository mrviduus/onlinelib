import { useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, ScrollView, useWindowDimensions,
} from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getStorageUrl, type UserLibraryItem, type ReadingProgressDto } from '@textstack/shared'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { useToast } from '../../context/ToastContext'
import { fonts } from '../../theme/typography'
import { EmptyState } from '../ui/EmptyState'
import { AddToCollectionSheet } from './AddToCollectionSheet'
import { GeneratedCover } from './GeneratedCover'
import { LibrarySearch } from './LibrarySearch'
import { LibraryStatusTabs } from './LibraryStatusTabs'
import { useLibrarySort, sortLibraryItems } from '../../hooks/useLibrarySort'
import { filterLibraryItems, countsForLibrary } from '../../hooks/useLibraryFilter'
import { useLibraryStatus } from '../../hooks/useLibraryStatus'
import { useLibrarySearch } from '../../hooks/useLibrarySearch'
import { matchesQuery } from '../../lib/searchUtils'
import { useBookActions } from '../../hooks/useBookActions'
import { styles, SORT_KEYS, type ViewMode } from './shared'

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function SavedList({ library, setLibrary, progressMap, setProgressMap, refreshing, onRefresh, viewMode, collectionFilterIds, shelvesHeader }: {
  library: UserLibraryItem[]; setLibrary: React.Dispatch<React.SetStateAction<UserLibraryItem[]>>; progressMap: Record<string, ReadingProgressDto>; setProgressMap: React.Dispatch<React.SetStateAction<Record<string, ReadingProgressDto>>>; refreshing: boolean; onRefresh: () => void; viewMode: ViewMode; collectionFilterIds: Set<string> | null; shelvesHeader: React.ReactNode
}) {
  const router = useRouter()
  const { colors } = useTheme()
  const { t } = useLanguage()
  const { show: showToast } = useToast()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  // Clear the floating tab bar (~56 + bottom inset) so the last row/card isn't
  // hidden behind it or the raised "+" button.
  const bottomPad = 56 + insets.bottom + 24
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
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomPad }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Reaching here means the catalog tab is empty but uploads are not —
            the screen returns FirstBookState before rendering any list when the
            user has nothing at all. So the header always belongs here now. */}
        {shelvesHeader}
        <View style={styles.center}>
          <EmptyState
            icon="book-outline"
            title={t('library.emptyLibrary')}
            subtitle={t('library.browseBooks')}
            buttonLabel={t('library.browseBooks')}
            onButtonPress={() => router.push('/(tabs)/search')}
          />
        </View>
      </ScrollView>
    )
  }

  const filtered = filterLibraryItems(library, filter, progressMap)
  const searched = debouncedQuery ? filtered.filter(i => matchesQuery({ title: i.title }, debouncedQuery)) : filtered
  const collectionFiltered = collectionFilterIds ? searched.filter(i => collectionFilterIds.has(i.editionId)) : searched
  const sorted = sortLibraryItems(collectionFiltered, sort, progressMap)

  return (
    <>
      <FlatList
        key={viewMode}
        data={sorted}
        numColumns={viewMode === 'grid' ? numColumns : 1}
        keyExtractor={item => item.editionId}
        ListHeaderComponent={
          <View>
            {shelvesHeader}
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
        contentContainerStyle={[viewMode === 'grid' ? styles.gridContent : styles.listContent, { paddingBottom: bottomPad }]}
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
