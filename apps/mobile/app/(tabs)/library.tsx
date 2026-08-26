import { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  libraryApi, readingProgressApi, userBooksApi,
} from '@textstack/shared'
import {
  collectionsApi, buildLibraryEntries, filterEntries, countEntries, sortEntries, entryTitle, entryAuthor,
  type UserLibraryItem, type UserBookDto, type ReadingProgressDto,
} from '@textstack/shared'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme } from '../../src/context/ThemeContext'
import { useLanguage } from '../../src/context/LanguageContext'
import { useToast } from '../../src/context/ToastContext'
import { useCollectionsVersion } from '../../src/hooks/useCollections'
import { SkeletonLoader } from '../../src/components/ui/SkeletonLoader'
import { EmptyState } from '../../src/components/ui/EmptyState'
import { FirstBookState } from '../../src/components/library/FirstBookState'
import { LibraryViewSheet, type LibrarySource } from '../../src/components/library/LibraryViewSheet'
import { LibrarySearch } from '../../src/components/library/LibrarySearch'
import { LibraryStatusTabs } from '../../src/components/library/LibraryStatusTabs'
import { useLibrarySort } from '../../src/hooks/useLibrarySort'
import { useLibraryStatus } from '../../src/hooks/useLibraryStatus'
import { useLibrarySearch } from '../../src/hooks/useLibrarySearch'
import { matchesQuery } from '../../src/lib/searchUtils'
import { ResumeHero } from '../../src/components/library/ResumeHero'
import { useContinueReadingList } from '../../src/hooks/useContinueReadingList'
import { BookList } from '../../src/components/library/BookList'
import { styles, type ViewMode } from '../../src/components/library/shared'
import { fonts } from '../../src/theme/typography'

const VIEW_MODE_KEY = 'textstack_library_view'

export default function LibraryScreen() {
  const { isAuthenticated } = useAuth()
  const { colors } = useTheme()
  const { t } = useLanguage()
  const { show: showToast } = useToast()
  const router = useRouter()
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [source, setSource] = useState<LibrarySource>('all')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null)
  const [collectionSavedIds, setCollectionSavedIds] = useState<Set<string> | null>(null)
  const [collectionUploadIds, setCollectionUploadIds] = useState<Set<string> | null>(null)
  const collectionsVersion = useCollectionsVersion()
  // One library means one of each control. These used to be duplicated per tab
  // — two sort keys, two status filters, two search boxes — because there were
  // two lists.
  const { sort, setSort } = useLibrarySort('library')
  const { status, setStatus } = useLibraryStatus()
  const { query, debouncedQuery, setQuery, clear: clearQuery } = useLibrarySearch('library')
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
  // Must sit above the early returns below — it is a hook, and `loading` /
  // `!isAuthenticated` both bail out before the render body.
  const resumeList = useContinueReadingList(library, progressMap, userBooks)

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

  useEffect(() => {
    if (!activeCollectionId) {
      setCollectionSavedIds(null)
      setCollectionUploadIds(null)
      return
    }
    let cancelled = false
    Promise.all([
      collectionsApi.getCollectionBookIds(activeCollectionId, 'savedbook').catch(() => [] as string[]),
      collectionsApi.getCollectionBookIds(activeCollectionId, 'userbook').catch(() => [] as string[]),
    ]).then(([s, u]) => {
      if (cancelled) return
      setCollectionSavedIds(new Set(s))
      setCollectionUploadIds(new Set(u))
    })
    return () => { cancelled = true }
    // collectionsVersion bumps when caches invalidate (e.g. after add-to-
    // collection) — refetch keeps the active filter in sync without the user
    // having to leave & re-enter the collection.
  }, [activeCollectionId, collectionsVersion])

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

  // Nothing anywhere: one screen, one action. Rendering the lists here would
  // give the user a search box, status tabs, a sort row and a grid toggle for
  // zero books — and a generic "browse the catalog" CTA, which is the wrong
  // first step for a reader who came here to read their own file.
  if (library.length === 0 && userBooks.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <FirstBookState />
      </View>
    )
  }

  // One list. Source, status, search and sort are lenses over the same books —
  // never separate destinations. `buildLibraryEntries` tags each record with the
  // storage shape it came from so a row can show what only that shape has (an
  // upload can be mid-parse) without splitting the list in two.
  const sourceEntries = buildLibraryEntries(library, userBooks, source)
  const counts = countEntries(sourceEntries, progressMap)
  const statusFiltered = filterEntries(sourceEntries, status, progressMap)
  const searched = debouncedQuery
    ? statusFiltered.filter(e => matchesQuery({ title: entryTitle(e), author: entryAuthor(e) }, debouncedQuery))
    : statusFiltered
  const collectionFiltered = activeCollectionId
    ? searched.filter(e => (e.kind === 'saved' ? collectionSavedIds : collectionUploadIds)?.has(
        e.kind === 'saved' ? e.item.editionId : e.book.id,
      ) ?? false)
    : searched
  const entries = sortEntries(collectionFiltered, sort, progressMap)

  // Everything above the first book row. Three blocks: resume, search, filters.
  // It used to be thirteen — roughly 2.4 screens of chrome a reader scrolled
  // past to reach their own books.
  const listHeader = (
    <>
      {resumeList.length > 0 && <ResumeHero pick={resumeList[0]} />}
      <LibrarySearch value={query} onChange={setQuery} onClear={clearQuery} />
      <View style={styles.controlRow}>
        <View style={{ flex: 1 }}>
          <LibraryStatusTabs value={status} onChange={setStatus} counts={counts} />
        </View>
        <TouchableOpacity
          onPress={() => setSheetOpen(true)}
          hitSlop={10}
          style={styles.viewBtn}
          accessibilityRole="button"
          accessibilityLabel={t('library.view.open')}
        >
          <Ionicons name="options-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
      {entries.length === 0 && (
        <View style={styles.filterEmpty}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}>
            {debouncedQuery ? t('library.search.empty').replace('{query}', debouncedQuery) : t('library.filter.empty')}
          </Text>
          <TouchableOpacity
            onPress={() => { if (debouncedQuery) clearQuery(); else setStatus('all') }}
            style={[styles.filterEmptyBtn, { borderColor: colors.border }]}
          >
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: colors.text }}>
              {debouncedQuery ? t('library.search.clear') : t('library.filter.clear')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  )

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <BookList
        entries={entries}
        progressMap={progressMap}
        library={library}
        setLibrary={setLibrary}
        setProgressMap={setProgressMap}
        refreshing={refreshing}
        onRefresh={onRefresh}
        viewMode={viewMode}
        listHeader={listHeader}
      />
      <LibraryViewSheet
        visible={sheetOpen}
        source={source}
        counts={{ all: library.length + userBooks.length, uploads: userBooks.length, catalog: library.length }}
        sort={sort}
        viewMode={viewMode}
        activeCollectionId={activeCollectionId}
        onSelectSource={setSource}
        onSelectSort={setSort}
        onSelectViewMode={toggleView}
        onCollectionSelect={setActiveCollectionId}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  )
}
