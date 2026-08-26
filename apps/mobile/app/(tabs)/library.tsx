import { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  libraryApi, readingProgressApi, userBooksApi,
} from '@textstack/shared'
import { collectionsApi, type UserLibraryItem, type UserBookDto, type ReadingProgressDto } from '@textstack/shared'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme } from '../../src/context/ThemeContext'
import { useLanguage } from '../../src/context/LanguageContext'
import { useToast } from '../../src/context/ToastContext'
import { useCollectionsVersion } from '../../src/hooks/useCollections'
import { SkeletonLoader } from '../../src/components/ui/SkeletonLoader'
import { EmptyState } from '../../src/components/ui/EmptyState'
import { LibraryShelves } from '../../src/components/library/LibraryShelves'
import { FirstBookState } from '../../src/components/library/FirstBookState'
import { LibrarySidebarDrawer, type LibrarySource } from '../../src/components/library/LibrarySidebarDrawer'
import { ResumeHero } from '../../src/components/library/ResumeHero'
import { JumpBackInRail } from '../../src/components/library/JumpBackInRail'
import { VocabularyReviewCard } from '../../src/components/home/VocabularyReviewCard'
import { useContinueReadingList } from '../../src/hooks/useContinueReadingList'
import { SavedList } from '../../src/components/library/SavedList'
import { UploadsList } from '../../src/components/library/UploadsList'
import { styles, type ViewMode } from '../../src/components/library/shared'
import { clearLibraryShelvesCache } from '../../src/hooks/useLibraryShelves'

type Tab = 'saved' | 'uploads'

const VIEW_MODE_KEY = 'textstack_library_view'

export default function LibraryScreen() {
  const { isAuthenticated } = useAuth()
  const { colors } = useTheme()
  const { t } = useLanguage()
  const { show: showToast } = useToast()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('saved')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [source, setSource] = useState<LibrarySource>('all')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null)
  const [collectionSavedIds, setCollectionSavedIds] = useState<Set<string> | null>(null)
  const [collectionUploadIds, setCollectionUploadIds] = useState<Set<string> | null>(null)
  const collectionsVersion = useCollectionsVersion()
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
    // Pull-to-refresh is an explicit "give me fresh data" intent: invalidate
    // the shelves TTL cache too (it fires an immediate refetch in the live
    // LibraryShelves via the pub/sub) so the carousels aren't left stale while
    // the rest of the screen reloads (FIX 3).
    clearLibraryShelvesCache()
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

  const effectiveTab: Tab = source === 'uploads' ? 'uploads'
    : source === 'catalog' ? 'saved'
    : tab
  const showTabs = source === 'all'

  // Browsing chrome — filters, Saved/Uploads, grid/list. It belongs to the
  // rare "I want a different book" case, so it sits BELOW the resume block and
  // scrolls away with the rest. It used to be pinned above everything, which
  // meant a returning reader's eye landed on "Open filters" and their own
  // email address before it landed on the book they were reading.
  const browseChrome = (
    <>
      <View style={styles.sidebarHeader}>
        <TouchableOpacity onPress={() => setDrawerOpen(true)} hitSlop={10} style={styles.menuBtn}>
          <Ionicons name="menu" size={20} color={colors.text} />
          <Text style={[styles.menuBtnText, { color: colors.text }]}>{t('library.sidebar.open')}</Text>
        </TouchableOpacity>
      </View>
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
    </>
  )

  // Strict priority order, not a feed. Resuming the current book is the single
  // most likely thing a returning reader wants, so it is first and largest.
  // Everything under it — vocabulary, shelves, then the browsing chrome and the
  // grid itself — serves the rarer "a different book" case.
  //
  // All of it lives in the list's ListHeaderComponent so it scrolls as one
  // surface. A pinned top region used to cut off "Quick reads" and below with
  // no way to reach them.
  const shelvesHeader = (
    <>
      {resumeList.length > 0 && <ResumeHero pick={resumeList[0]} />}
      <JumpBackInRail picks={resumeList.slice(1)} />
      <VocabularyReviewCard />
      <LibraryShelves />
      {browseChrome}
    </>
  )

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {effectiveTab === 'saved' ? (
        <SavedList library={library} setLibrary={setLibrary} progressMap={progressMap} setProgressMap={setProgressMap} refreshing={refreshing} onRefresh={onRefresh} viewMode={viewMode} collectionFilterIds={collectionSavedIds} shelvesHeader={shelvesHeader} />
      ) : (
        <UploadsList books={userBooks} refreshing={refreshing} onRefresh={onRefresh} viewMode={viewMode} collectionFilterIds={collectionUploadIds} shelvesHeader={shelvesHeader} />
      )}
      <LibrarySidebarDrawer
        visible={drawerOpen}
        source={source}
        counts={{ all: library.length + userBooks.length, uploads: userBooks.length, catalog: library.length }}
        activeCollectionId={activeCollectionId}
        onSelect={(next) => {
          setSource(next)
          if (next === 'uploads') setTab('uploads')
          else if (next === 'catalog') setTab('saved')
        }}
        onCollectionSelect={setActiveCollectionId}
        onClose={() => setDrawerOpen(false)}
      />
    </View>
  )
}
