import { useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, RefreshControl, useWindowDimensions } from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  getStorageUrl,
  entryKey, entryTitle, entryAuthor, entryCoverPath, entryProgress,
  type LibraryEntry, type UserLibraryItem, type ReadingProgressDto,
} from '@textstack/shared'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { useToast } from '../../context/ToastContext'
import { fonts } from '../../theme/typography'
import { AddToCollectionSheet } from './AddToCollectionSheet'
import { BookStatusBadge } from './BookStatusBadge'
import { GeneratedCover } from './GeneratedCover'
import { useBookActions } from '../../hooks/useBookActions'
import { styles, type ViewMode } from './shared'

/**
 * The reader's books — all of them, in one list.
 *
 * There used to be two lists behind two tabs, "Saved" and "Uploads", which are
 * table names. They shared roughly 85% of their markup and drifted anyway. A
 * book's storage shape now only decides what a row can show (an upload can be
 * mid-parse; a catalog edition cannot), never which list it lives in.
 *
 * Filtering, sorting and search happen on the screen above; this renders what
 * it is given.
 */

const NEW_BADGE_TTL_MS = 24 * 60 * 60 * 1000

function isNewUpload(createdAt?: string): boolean {
  if (!createdAt) return false
  const ts = Date.parse(createdAt)
  if (Number.isNaN(ts)) return false
  return Date.now() - ts < NEW_BADGE_TTL_MS
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface Props {
  /** Already filtered by source/status/search and sorted by the screen. */
  entries: LibraryEntry[]
  progressMap: Record<string, ReadingProgressDto>
  library: UserLibraryItem[]
  setLibrary: React.Dispatch<React.SetStateAction<UserLibraryItem[]>>
  setProgressMap: React.Dispatch<React.SetStateAction<Record<string, ReadingProgressDto>>>
  refreshing: boolean
  onRefresh: () => void
  viewMode: ViewMode
  listHeader: React.ReactNode
}

export function BookList({
  entries, progressMap, library, setLibrary, setProgressMap,
  refreshing, onRefresh, viewMode, listHeader,
}: Props) {
  const router = useRouter()
  const { colors } = useTheme()
  const { t } = useLanguage()
  const { show: showToast } = useToast()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  // Clear the floating tab bar (~56 + bottom inset) so the last row isn't
  // hidden behind it or the raised "+" button.
  const bottomPad = 56 + insets.bottom + 24
  const numColumns = viewMode === 'grid' ? Math.max(2, Math.floor(width / 130)) : 1

  const { showSavedActions, showUploadActions } = useBookActions()
  const [collectionTarget, setCollectionTarget] = useState<LibraryEntry | null>(null)

  const handleAction = (e: LibraryEntry) => {
    if (e.kind === 'saved') {
      showSavedActions(e.item, {
        progressMap, setLibrary, setProgressMap, library,
        onAddToCollection: () => setCollectionTarget(e),
      })
      return
    }
    showUploadActions(e.book, {
      onChange: onRefresh,
      openDetails: (id) => router.push(`/my-books/${id}`),
      onAddToCollection: () => setCollectionTarget(e),
    })
  }

  /** Where tapping the row goes. An upload still parsing has nothing to open. */
  const openEntry = (e: LibraryEntry) => {
    if (e.kind === 'saved') { router.push(`/book/${e.item.slug}`); return }
    const s = e.book.status.toLowerCase()
    if (s === 'ready' || s === 'completed') router.push(`/my-books/${e.book.id}`)
  }

  const renderEntry = (e: LibraryEntry) => {
    const title = entryTitle(e) || 'Untitled'
    const author = entryAuthor(e)
    const cover = entryCoverPath(e)
    const pct = Math.round(entryProgress(e, progressMap) * 100)

    const status = e.kind === 'upload' ? e.book.status.toLowerCase() : 'ready'
    const isReady = status === 'ready' || status === 'completed'
    const isProcessing = e.kind === 'upload' && !isReady && status !== 'failed'
    const isFailed = status === 'failed'
    const finishedAt = e.kind === 'upload' ? e.book.completedAt : null
    const isFinished = e.kind === 'upload' ? (finishedAt != null || pct >= 100) : pct >= 100
    const showNew = e.kind === 'upload' && isReady && !finishedAt && isNewUpload(e.book.createdAt)
    const dimmed = !isReady

    // One badge system: the pill over the cover states what is wrong or new.
    // A second, differently-styled status line used to sit in the text column
    // saying the same words.
    const pill = isProcessing ? 'processing' : isFailed ? 'failed' : showNew ? 'new' : null

    if (viewMode === 'grid') {
      const cardWidth = (width - 20 - (numColumns - 1) * 10) / numColumns
      return (
        <View style={{ width: cardWidth, marginBottom: 14, position: 'relative' }}>
          <TouchableOpacity onPress={() => openEntry(e)} onLongPress={() => handleAction(e)} activeOpacity={0.85}>
            <View>
              {cover ? (
                <Image source={getStorageUrl(cover)} style={styles.gridCover} contentFit="cover" />
              ) : (
                <GeneratedCover title={title} author={author} style={styles.gridCover} />
              )}
              {isFinished && (
                <View style={[styles.gridBadge, { backgroundColor: colors.success }]}>
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
              )}
              {pill && (
                <View style={styles.gridPillSlot}>
                  <BookStatusBadge variant={pill} />
                </View>
              )}
            </View>
            {pct > 0 && pct < 100 && (
              <View style={[styles.gridProgressTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.gridProgressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
              </View>
            )}
            <Text style={[styles.gridTitle, { color: dimmed ? colors.textSecondary : colors.text }]} numberOfLines={2}>
              {title}
            </Text>
            {!!author && (
              <Text style={[styles.bookAuthor, { color: colors.textSecondary }]} numberOfLines={1}>{author}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.gridDotsBtn, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
            onPress={() => handleAction(e)}
            hitSlop={8}
            accessibilityLabel={t('library.actions.menu')}
          >
            <Ionicons name="ellipsis-vertical" size={14} color="#fff" />
          </TouchableOpacity>
        </View>
      )
    }

    const serverProgress = e.kind === 'saved' ? progressMap[e.item.editionId] : undefined
    const continueSlug = e.kind === 'saved' ? serverProgress?.chapterSlug : null
    const lastRead = e.kind === 'saved' ? serverProgress?.updatedAt : e.book.progressUpdatedAt

    return (
      <View style={[styles.bookRow, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={{ flexDirection: 'row', flex: 1 }}
          onPress={() => openEntry(e)}
          onLongPress={() => handleAction(e)}
          activeOpacity={0.85}
        >
          <View style={styles.coverWrapper}>
            {cover ? (
              <Image source={getStorageUrl(cover)} style={styles.cover} contentFit="cover" />
            ) : (
              <GeneratedCover title={title} author={author} style={styles.cover} />
            )}
            {pill && (
              <View style={styles.listPillSlot}>
                <BookStatusBadge variant={pill} />
              </View>
            )}
          </View>

          <View style={styles.bookInfo}>
            <Text style={[styles.bookTitle, { color: dimmed ? colors.textSecondary : colors.text }]} numberOfLines={2}>
              {title}
            </Text>
            {!!author && (
              <Text style={[styles.bookAuthor, { color: colors.textSecondary }]} numberOfLines={1}>{author}</Text>
            )}

            {isFinished ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={{ fontSize: 12, color: colors.success, fontFamily: fonts.sansMedium }}>
                  {t('library.filter.finished')}
                </Text>
              </View>
            ) : pct > 0 ? (
              <View style={styles.progressRow}>
                <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                  <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                </View>
                <Text style={[styles.progressText, { color: colors.textSecondary }]}>{pct}%</Text>
              </View>
            ) : null}

            {isFailed && e.kind === 'upload' && e.book.errorMessage && (
              <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.error, marginTop: 4 }} numberOfLines={2}>
                {e.book.errorMessage}
              </Text>
            )}

            {lastRead && !isFailed && (
              <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>
                {t('library.lastRead')} {formatTimeAgo(lastRead)}
              </Text>
            )}

            {continueSlug ? (
              <TouchableOpacity
                style={[styles.continueBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push(`/reader/${(e as { item: UserLibraryItem }).item.slug}/${continueSlug}`)}
              >
                <Ionicons name="play" size={12} color="#fff" />
                <Text style={styles.continueBtnText}>{t('library.resume.continue')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.rowDotsBtn}
          onPress={() => handleAction(e)}
          hitSlop={10}
          accessibilityLabel={t('library.actions.menu')}
        >
          <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    )
  }

  const targetId = collectionTarget
    ? (collectionTarget.kind === 'saved' ? collectionTarget.item.editionId : collectionTarget.book.id)
    : null

  return (
    <>
      <FlatList
        key={viewMode}
        data={entries}
        numColumns={numColumns}
        keyExtractor={entryKey}
        ListHeaderComponent={<View>{listHeader}</View>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={[viewMode === 'grid' ? styles.gridContent : styles.listContent, { paddingBottom: bottomPad }]}
        columnWrapperStyle={viewMode === 'grid' ? { gap: 10 } : undefined}
        renderItem={({ item }) => renderEntry(item)}
      />
      <AddToCollectionSheet
        visible={!!collectionTarget}
        bookId={targetId}
        bookType={collectionTarget?.kind === 'upload' ? 'userbook' : 'savedbook'}
        onClose={() => setCollectionTarget(null)}
        onAdded={(name) => showToast({ message: t('library.actions.addedToCollection').replace('{{name}}', name), variant: 'success' })}
      />
    </>
  )
}
