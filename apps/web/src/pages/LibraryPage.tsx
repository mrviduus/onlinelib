import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useHighlightedBook } from '../hooks/useHighlightedBook'
import { useLibrary } from '../hooks/useLibrary'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import { SeoHead } from '../components/SeoHead'
import { Footer } from '../components/Footer'
import { OfflineBadge } from '../components/OfflineBadge'
import { BookActionMenu } from '../components/library/BookActionMenu'
import { UploadSection } from '../components/library/UploadSection'
import { UploadDropZone } from '../components/library/UploadDropZone'
import { LibraryShelves } from '../components/library/LibraryShelves'
import { LibrarySidebar } from '../components/library/LibrarySidebar'
import { useLibrarySource } from '../hooks/useLibrarySource'
import { LibraryStatsHeader } from '../components/library/LibraryStatsHeader'
import { LibrarySortMenu } from '../components/library/LibrarySortMenu'
import { LibraryStatusTabs } from '../components/library/LibraryStatusTabs'
import { LibrarySearch } from '../components/library/LibrarySearch'
import { useLibrarySort } from '../hooks/useLibrarySort'
import {
  filterLibraryItems, filterUserBooks, countsForLibrary, countsForUploads,
} from '../hooks/useLibraryFilter'
import { useLibraryStatus } from '../hooks/useLibraryStatus'
import { useLibrarySearch } from '../hooks/useLibrarySearch'
import { matchesQuery, parseQuery } from '../lib/searchUtils'
import { UserBookCard } from '../components/library/UserBookCard'
import { CollectionChips } from '../components/library/CollectionChips'
import { getCollectionBookIds } from '../api/collections'
import { BulkActionBar } from '../components/library/BulkActionBar'
import { useLibrarySelection } from '../hooks/useLibrarySelection'
import { invalidateUserTagsCache } from '../hooks/useUserTags'
import { EmptyState } from '../components/EmptyState'
import { createApi, getStorageUrl } from '../api/client'
import {
  getUserBooks, getUserBookCoverUrl, type UserBook,
  bulkDeleteUserBooks, bulkFinishUserBooks, bulkTagUserBooks, bulkAddToCollection,
  searchUserLibrary, type UserBookSearchHit,
} from '../api/userBooks'
import { stringToColor } from '../utils/colors'
import { getAllProgress, ReadingProgressDto, markAsRead, markAsUnread } from '../api/auth'

type ViewMode = 'list' | 'grid'

export function LibraryPage() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth()
  const { items, loading, remove } = useLibrary()
  const { language } = useLanguage()
  const { t } = useTranslation()
  const [progressMap, setProgressMap] = useState<Record<string, ReadingProgressDto>>({})
  const [searchParams, setSearchParamsLib] = useSearchParams()
  const librarySource = useLibrarySource()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const showSavedBlock = librarySource.source === 'all' || librarySource.source === 'catalog'
  const showUploadsBlock = librarySource.source === 'all' || librarySource.source === 'uploads'
  const highlightedBookId = useHighlightedBook()
  const [userBooks, setUserBooks] = useState<UserBook[]>([])
  const [userBooksLoading, setUserBooksLoading] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('library-view') as ViewMode) || 'list'
  })
  const { sort, setSort } = useLibrarySort('saved')
  const { status, setStatus } = useLibraryStatus()
  const {
    query, debouncedQuery: queryD, setQuery, clear: clearQuery,
    contentSearch, setContentSearch,
  } = useLibrarySearch()
  const [contentHits, setContentHits] = useState<UserBookSearchHit[] | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const collectionIdParam = searchParams.get('collection')
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(collectionIdParam)
  const [collectionSavedIds, setCollectionSavedIds] = useState<Set<string> | null>(null)
  const [collectionUploadIds, setCollectionUploadIds] = useState<Set<string> | null>(null)
  const selection = useLibrarySelection()
  const [bulkBusy, setBulkBusy] = useState(false)

  useEffect(() => {
    if (!activeCollectionId) {
      setCollectionSavedIds(null)
      setCollectionUploadIds(null)
      return
    }
    let cancelled = false
    Promise.all([
      getCollectionBookIds(activeCollectionId, 'savedbook').catch(() => [] as string[]),
      getCollectionBookIds(activeCollectionId, 'userbook').catch(() => [] as string[]),
    ]).then(([saved, uploads]) => {
      if (cancelled) return
      setCollectionSavedIds(new Set(saved))
      setCollectionUploadIds(new Set(uploads))
    })
    return () => { cancelled = true }
  }, [activeCollectionId])

  const onCollectionChange = (id: string | null) => {
    setActiveCollectionId(id)
    setSearchParamsLib((prev) => {
      const sp = new URLSearchParams(prev)
      if (id) sp.set('collection', id)
      else sp.delete('collection')
      return sp
    }, { replace: true })
    // Anchor scroll to the grid so the user sees the filtered list update
    // immediately. Defer one frame so the layout has applied the new filter.
    if (id) {
      window.requestAnimationFrame(() => {
        document.getElementById('library-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  const onUploadTagSelect = (tag: string | null) => {
    if (!tag) { setQuery(parseQuery(queryD).text); return }
    const text = parseQuery(queryD).text
    setQuery(text ? `tag:${tag} ${text}` : `tag:${tag}`)
  }

  // Persist view mode
  useEffect(() => {
    localStorage.setItem('library-view', viewMode)
  }, [viewMode])

  // Content search (server-side FTS) — runs only when toggle is on and we have a query
  useEffect(() => {
    if (!showUploadsBlock) return
    if (!contentSearch) { setContentHits(null); return }
    const parsed = parseQuery(queryD)
    if (!parsed.text) { setContentHits(null); return }
    const ctrl = new AbortController()
    setContentLoading(true)
    searchUserLibrary(parsed.text, parsed.tags, ctrl.signal)
      .then(hits => setContentHits(hits))
      .catch(err => { if (err?.name !== 'AbortError') setContentHits([]) })
      .finally(() => setContentLoading(false))
    return () => ctrl.abort()
  }, [contentSearch, queryD, showUploadsBlock])

  // Fetch user books
  const fetchUserBooks = useCallback(async () => {
    if (!isAuthenticated) return
    setUserBooksLoading(true)
    try {
      const books = await getUserBooks()
      setUserBooks(books)
    } catch {
      // Ignore errors
    } finally {
      setUserBooksLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    fetchUserBooks()
  }, [fetchUserBooks])


  // Auto-refresh processing books
  useEffect(() => {
    const processingBooks = userBooks.filter(b => b.status === 'Processing')
    if (processingBooks.length === 0) return

    const interval = setInterval(fetchUserBooks, 5000)
    return () => clearInterval(interval)
  }, [userBooks, fetchUserBooks])

  // Mark book as read
  const handleMarkRead = useCallback(async (editionId: string, slug: string, bookLanguage: string) => {
    try {
      const bookApi = createApi(bookLanguage)
      const book = await bookApi.getBook(slug)
      if (book.chapters.length === 0) return
      const lastChapter = book.chapters[book.chapters.length - 1]
      const result = await markAsRead(editionId, lastChapter.id)
      setProgressMap(prev => ({ ...prev, [editionId]: result }))
    } catch (err) {
      console.error('Failed to mark as read:', err)
    }
  }, [])

  // Mark book as unread
  const handleMarkUnread = useCallback(async (editionId: string, slug: string, bookLanguage: string) => {
    try {
      const bookApi = createApi(bookLanguage)
      const book = await bookApi.getBook(slug)
      if (book.chapters.length === 0) return
      const firstChapter = book.chapters[0]
      const result = await markAsUnread(editionId, firstChapter.id)
      setProgressMap(prev => ({ ...prev, [editionId]: result }))
    } catch (err) {
      console.error('Failed to mark as unread:', err)
    }
  }, [])

  // Fetch all reading progress
  useEffect(() => {
    if (!isAuthenticated) return
    getAllProgress()
      .then((res) => {
        const map: Record<string, ReadingProgressDto> = {}
        res.items.forEach((p) => {
          map[p.editionId] = p
        })
        setProgressMap(map)
      })
      .catch(() => {})
  }, [isAuthenticated])

  const savedCounts = countsForLibrary(items, progressMap)
  const uploadsCounts = countsForUploads(userBooks)
  // Combined counts for unified status tabs
  const combinedCounts = {
    all: (showSavedBlock ? savedCounts.all : 0) + (showUploadsBlock ? uploadsCounts.all : 0),
    reading: (showSavedBlock ? savedCounts.reading : 0) + (showUploadsBlock ? uploadsCounts.reading : 0),
    finished: (showSavedBlock ? savedCounts.finished : 0) + (showUploadsBlock ? uploadsCounts.finished : 0),
    notStarted: (showSavedBlock ? savedCounts.notStarted : 0) + (showUploadsBlock ? uploadsCounts.notStarted : 0),
    failed: (showSavedBlock ? savedCounts.failed : 0) + (showUploadsBlock ? uploadsCounts.failed : 0),
  }
  const filteredItems = filterLibraryItems(items, status, progressMap)
  const filteredUserBooks = filterUserBooks(userBooks, status)
  const searchedItems = queryD ? filteredItems.filter(i => matchesQuery({ title: i.title, author: i.author ?? undefined }, queryD)) : filteredItems
  const searchedUserBooks = queryD ? filteredUserBooks.filter(b => matchesQuery({ title: b.title, author: b.author, tags: b.tags }, queryD)) : filteredUserBooks
  const collectionFilteredItems = activeCollectionId && collectionSavedIds
    ? searchedItems.filter(i => collectionSavedIds.has(i.editionId))
    : searchedItems
  const collectionFilteredUserBooks = activeCollectionId && collectionUploadIds
    ? searchedUserBooks.filter(b => collectionUploadIds.has(b.id))
    : searchedUserBooks
  // Unified merge-sort: tag each item by kind and apply a single comparator so
  // saved + uploads can be interleaved correctly by the chosen sort key.
  type CombinedItem =
    | { kind: 'saved'; item: typeof items[number] }
    | { kind: 'upload'; book: UserBook }
  const combinedCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
  const timeOf = (s: string | null | undefined): number => {
    if (!s) return 0
    const t = Date.parse(s)
    return Number.isNaN(t) ? 0 : t
  }
  const combinedItems: CombinedItem[] = [
    ...(showSavedBlock ? collectionFilteredItems.map((item) => ({ kind: 'saved' as const, item })) : []),
    ...(showUploadsBlock ? collectionFilteredUserBooks.map((book) => ({ kind: 'upload' as const, book })) : []),
  ]
  const attentionRank = (c: CombinedItem): number => {
    if (c.kind === 'upload' && c.book.status !== 'Ready') return 0
    return 1
  }
  const compareCombined = (a: CombinedItem, b: CombinedItem): number => {
    const ar = attentionRank(a)
    const br = attentionRank(b)
    if (ar !== br) return ar - br
    switch (sort) {
      case 'title': {
        const ta = a.kind === 'saved' ? a.item.title : a.book.title
        const tb = b.kind === 'saved' ? b.item.title : b.book.title
        return combinedCollator.compare(ta || '', tb || '')
      }
      case 'author': {
        const aa = a.kind === 'saved' ? (a.item.author || '') : (a.book.author || '')
        const ab = b.kind === 'saved' ? (b.item.author || '') : (b.book.author || '')
        if (!aa && !ab) return 0
        if (!aa) return 1
        if (!ab) return -1
        return combinedCollator.compare(aa, ab)
      }
      case 'added': {
        const da = a.kind === 'saved' ? a.item.createdAt : a.book.createdAt
        const db = b.kind === 'saved' ? b.item.createdAt : b.book.createdAt
        return timeOf(db) - timeOf(da)
      }
      case 'progress': {
        const pa = a.kind === 'saved' ? (progressMap[a.item.editionId]?.percent ?? 0) : (a.book.progressPercent ?? 0)
        const pb = b.kind === 'saved' ? (progressMap[b.item.editionId]?.percent ?? 0) : (b.book.progressPercent ?? 0)
        return pb - pa
      }
      case 'recent':
      default: {
        const ta = a.kind === 'saved'
          ? (timeOf(progressMap[a.item.editionId]?.updatedAt) || timeOf(a.item.createdAt))
          : timeOf(a.book.progressUpdatedAt || a.book.createdAt)
        const tb = b.kind === 'saved'
          ? (timeOf(progressMap[b.item.editionId]?.updatedAt) || timeOf(b.item.createdAt))
          : timeOf(b.book.progressUpdatedAt || b.book.createdAt)
        return tb - ta
      }
    }
  }
  const combinedSorted: CombinedItem[] = [...combinedItems].sort(compareCombined)

  // FTS content-search override: replace combined list with upload-only FTS hits
  // (saved books don't have content FTS, so showing them mixed in would be misleading).
  const excerptByBookId = new Map<string, UserBookSearchHit>()
  let renderList: CombinedItem[] = combinedSorted
  if (showUploadsBlock && contentSearch && contentHits) {
    const bookMap = new Map(userBooks.map(b => [b.id, b]))
    const ftsList: CombinedItem[] = []
    for (const h of contentHits) {
      excerptByBookId.set(h.id, h)
      const book = bookMap.get(h.id)
      if (book) ftsList.push({ kind: 'upload', book })
    }
    renderList = ftsList
  }
  const sortedUserBooks: UserBook[] = renderList.flatMap(c => (c.kind === 'upload' ? [c.book] : []))
  const contentSearchQuery = contentSearch ? parseQuery(queryD).text : ''

  // Bulk handlers (uploads tab) — defined here so sortedUserBooks is in scope
  const runBulk = async (op: () => Promise<void>) => {
    setBulkBusy(true)
    try { await op() } finally { setBulkBusy(false) }
  }
  const ids = () => Array.from(selection.selected)
  const onBulkFinish = () => runBulk(async () => {
    await bulkFinishUserBooks(ids(), true)
    selection.exit()
    fetchUserBooks()
  })
  const onBulkDelete = () => {
    const titles = userBooks.filter(b => selection.selected.has(b.id)).slice(0, 5).map(b => b.title)
    const more = selection.count - titles.length
    const msg = `Delete ${selection.count} book${selection.count === 1 ? '' : 's'}?\n\n` +
      titles.join('\n') + (more > 0 ? `\n…and ${more} more` : '')
    if (!window.confirm(msg)) return
    runBulk(async () => {
      await bulkDeleteUserBooks(ids())
      selection.exit()
      fetchUserBooks()
    })
  }
  const onBulkAddTag = (tag: string) => runBulk(async () => {
    await bulkTagUserBooks(ids(), [tag], [])
    invalidateUserTagsCache()
    fetchUserBooks()
  })
  const onBulkAddToCollection = (collectionId: string) => runBulk(async () => {
    await bulkAddToCollection(collectionId, ids(), 'userbook')
    selection.exit()
    fetchUserBooks()
  })
  const onSelectAllVisible = () => selection.selectAll(sortedUserBooks.map(b => ({ id: b.id })))

  useEffect(() => {
    if (!selection.active) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        onSelectAllVisible()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.active, sortedUserBooks])

  if (authLoading) {
    return (
      <>
      <div className="library-page">
        <SeoHead title={t('library.title')} noindex />
        <div className="library-page__loading">{t('library.loading')}</div>
      </div>
      <Footer />
      </>
    )
  }

  if (!isAuthenticated) {
    return (
      <>
      <div className="library-page">
        <SeoHead title={t('library.title')} noindex />
        <EmptyState icon="📚" title={t('library.title')} subtitle={t('library.signInPrompt')} />
      </div>
      <Footer />
      </>
    )
  }

  return (
    <>
    <div className="library-page library-page--stitch">
      <SeoHead title={t('library.title')} noindex />

      {/* Sidebar */}
      {sidebarOpen && (
        <div
          className="library-sidebar-v3__backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside className={`library-sidebar-v3 ${sidebarOpen ? 'library-sidebar-v3--open' : ''}`}>
        <LibrarySidebar
          source={librarySource.source}
          tag={librarySource.tag}
          collection={librarySource.collection}
          drawerOpen={sidebarOpen}
          counts={{
            all: items.length + userBooks.length,
            uploads: userBooks.length,
            catalog: items.length,
          }}
          onSourceChange={(s) => {
            librarySource.setSource(s)
            setSidebarOpen(false)
          }}
          onTagChange={(next) => {
            librarySource.setTag(next)
            setSidebarOpen(false)
            onUploadTagSelect(next)
          }}
          onCollectionChange={(id) => {
            librarySource.setCollection(id)
            setSidebarOpen(false)
            onCollectionChange(id)
          }}
        />
      </aside>

      {/* Main Content */}
      <main className="library-main">
        <header className="library-header">
          <button
            type="button"
            className="library-sidebar-toggle"
            onClick={() => setSidebarOpen(true)}
            aria-label={t('library.sidebar.open')}
          >
            <span className="material-icons-outlined">menu</span>
            {t('library.sidebar.open')}
          </button>
          <h1 className="library-header__title">{t('library.title')}</h1>
          {user && <p className="library-header__email">{user.email}</p>}
        </header>

        {isAuthenticated && <LibraryStatsHeader />}

        <LibraryShelves hasAnyContent={items.length > 0 || userBooks.length > 0} />

        <CollectionChips activeId={activeCollectionId} onSelect={onCollectionChange} />

        {showUploadModal && showUploadsBlock && (
          <UploadSection onUploadComplete={() => { fetchUserBooks(); setShowUploadModal(false) }} />
        )}

        {(() => {
          const totalRaw = (showSavedBlock ? items.length : 0) + (showUploadsBlock ? userBooks.length : 0)
          const totalVisible = renderList.length
          const isLoadingAny = (showSavedBlock && loading) || (showUploadsBlock && userBooksLoading && userBooks.length === 0)

          return (
            <div id="library-grid" style={{ scrollMarginTop: '90px' }}>
              {/* Toolbar (single, unified) */}
              <div className="library-toolbar">
                <div className="library-toolbar__left">
                  <LibrarySortMenu value={sort} onChange={setSort} />
                  {showUploadsBlock && userBooks.length > 0 && (
                    <button
                      type="button"
                      className={`library-select-btn ${selection.active ? 'library-select-btn--active' : ''}`}
                      onClick={() => selection.active ? selection.exit() : selection.enter()}
                    >
                      {selection.active ? t('library.bulk.cancel') : t('library.bulk.select')}
                    </button>
                  )}
                </div>
                <div className="library-toolbar__right">
                  <button
                    className={`library-view-btn ${viewMode === 'grid' ? 'library-view-btn--active' : ''}`}
                    onClick={() => setViewMode('grid')}
                    aria-label="Grid view"
                  >
                    <span className="material-icons-outlined">grid_view</span>
                  </button>
                  <button
                    className={`library-view-btn ${viewMode === 'list' ? 'library-view-btn--active' : ''}`}
                    onClick={() => setViewMode('list')}
                    aria-label="List view"
                  >
                    <span className="material-icons-outlined">format_list_bulleted</span>
                  </button>
                </div>
              </div>

              {totalRaw > 0 && (
                <>
                  <LibrarySearch
                    value={query}
                    onChange={setQuery}
                    contentSearch={showUploadsBlock ? contentSearch : undefined}
                    onToggleContentSearch={showUploadsBlock ? setContentSearch : undefined}
                  />
                  <LibraryStatusTabs value={status} onChange={setStatus} counts={combinedCounts} />
                </>
              )}

              {isLoadingAny ? (
                <div className="library-page__loading">{t('library.loading')}</div>
              ) : totalRaw === 0 ? (
                showUploadsBlock && !showSavedBlock ? (
                  <UploadDropZone />
                ) : (
                  <EmptyState icon="📖" title={t('library.emptyLibrary')} buttonLabel={t('library.browseBooks')} buttonTo="/books" />
                )
              ) : showUploadsBlock && contentSearch && contentLoading ? (
                <div className="library-page__loading">{t('library.loading')}</div>
              ) : totalVisible === 0 ? (
                queryD ? (
                  <div className="library-filters__empty">
                    <p>{t('library.search.empty').replace('{query}', queryD)}</p>
                    <button type="button" onClick={clearQuery}>{t('library.search.clear')}</button>
                  </div>
                ) : (
                  <div className="library-filters__empty">
                    <p>{t('library.filter.empty')}</p>
                    <button type="button" onClick={() => setStatus('all')}>{t('library.filter.clear')}</button>
                  </div>
                )
              ) : viewMode === 'list' ? (
                <div className="library-list">
                  {renderList.map((c) => c.kind === 'saved' ? (() => {
                    const item = c.item
                    const progress = progressMap[item.editionId]
                    const percent = progress?.percent ?? 0
                    const destination = progress?.chapterSlug
                      ? `/${item.language}/books/${item.slug}/${progress.chapterSlug}`
                      : `/${item.language}/books/${item.slug}`
                    return (
                      <article key={`saved-${item.editionId}`} className="library-list-item">
                        <Link to={destination} className="library-list-item__cover">
                          {item.coverPath ? (
                            <img src={getStorageUrl(item.coverPath)} alt={item.title} />
                          ) : (
                            <div
                              className="library-list-item__cover-placeholder"
                              style={{ backgroundColor: stringToColor(item.title) }}
                            >
                              {item.title?.[0] || '?'}
                            </div>
                          )}
                        </Link>
                        <div className="library-list-item__content">
                          <Link to={destination} className="library-list-item__title" title={item.title}>
                            {item.title}
                          </Link>
                          <div className="library-list-item__progress">
                            <div className="library-list-item__progress-header">
                              <span>{t('library.readingProgress')}</span>
                              <span className="library-list-item__progress-percent">{Math.round(percent * 100)}%</span>
                            </div>
                            <div className="library-list-item__progress-bar">
                              <div
                                className="library-list-item__progress-fill"
                                style={{ width: `${Math.round(percent * 100)}%` }}
                              />
                            </div>
                          </div>
                          <div className="library-list-item__info">
                            {item.author && (
                              <span className="library-list-item__info-item" title={item.author}>{item.author}</span>
                            )}
                            {progress?.updatedAt && (
                              <span className="library-list-item__info-item">
                                <span className="material-icons-outlined">schedule</span>
                                {t('library.lastRead')} {formatTimeAgo(progress.updatedAt, t)}
                              </span>
                            )}
                            <OfflineBadge editionId={item.editionId} />
                          </div>
                        </div>
                        <div className="library-list-item__actions">
                          <BookActionMenu
                            type="saved"
                            book={item}
                            isFinished={percent >= 1}
                            onRemove={() => remove(item.editionId)}
                            onMarkFinished={() => handleMarkRead(item.editionId, item.slug, item.language)}
                            onMarkUnfinished={() => handleMarkUnread(item.editionId, item.slug, item.language)}
                          />
                        </div>
                      </article>
                    )
                  })() : (() => {
                    const book = c.book
                    const isReady = book.status === 'Ready'
                    const percent = book.progressPercent ?? 0
                    const destination = isReady
                      ? (book.progressChapterSlug ? `/${language}/library/my/${book.id}/read/${book.progressChapterSlug}` : `/${language}/library/my/${book.id}`)
                      : '#'
                    const coverUrl = getUserBookCoverUrl(book.coverPath)
                    const isHighlighted = highlightedBookId === book.id
                    return (
                      <article key={`upload-${book.id}`} className={`library-list-item${isHighlighted ? ' library-list-item--highlighted' : ''}`}>
                        {isReady ? (
                          <Link to={destination} className="library-list-item__cover">
                            {coverUrl ? (
                              <img
                                src={coverUrl}
                                alt={book.title}
                                onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden') }}
                              />
                            ) : null}
                            <div
                              className={`library-list-item__cover-placeholder ${coverUrl ? 'hidden' : ''}`}
                              style={{ backgroundColor: stringToColor(book.title) }}
                            >
                              {book.title?.[0] || '?'}
                            </div>
                          </Link>
                        ) : (
                          <div className="library-list-item__cover library-list-item__cover--disabled">
                            {coverUrl ? (
                              <img
                                src={coverUrl}
                                alt={book.title}
                                onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden') }}
                              />
                            ) : null}
                            <div
                              className={`library-list-item__cover-placeholder ${coverUrl ? 'hidden' : ''}`}
                              style={{ backgroundColor: stringToColor(book.title) }}
                            >
                              {book.title?.[0] || '?'}
                            </div>
                          </div>
                        )}
                        <div className="library-list-item__content">
                          {isReady ? (
                            <Link to={destination} className="library-list-item__title">
                              {book.title}
                            </Link>
                          ) : (
                            <span className="library-list-item__title">{book.title}</span>
                          )}
                          {isReady && book.completedAt && (
                            <div className="library-list-item__progress">
                              <div className="library-list-item__progress-header">
                                <span className="library-list-item__completed-text">Read</span>
                              </div>
                            </div>
                          )}
                          {isReady && !book.completedAt && (
                            <div className="library-list-item__progress">
                              <div className="library-list-item__progress-header">
                                <span>{t('library.readingProgress')}</span>
                                <span className="library-list-item__progress-percent">{Math.round(percent * 100)}%</span>
                              </div>
                              <div className="library-list-item__progress-bar">
                                <div
                                  className="library-list-item__progress-fill"
                                  style={{ width: `${Math.round(percent * 100)}%` }}
                                />
                              </div>
                            </div>
                          )}
                          <div className="library-list-item__info">
                            {book.chapterCount > 0 && (
                              <span className="library-list-item__info-item">
                                {book.chapterCount} {t('library.chapters')}
                              </span>
                            )}
                            {isReady && book.progressUpdatedAt && (
                              <span className="library-list-item__info-item">
                                <span className="material-icons-outlined">schedule</span>
                                {t('library.lastRead')} {formatTimeAgo(book.progressUpdatedAt, t)}
                              </span>
                            )}
                            {book.status === 'Processing' && (
                              <span className="library-list-item__info-item library-list-item__info-item--processing">
                                <span className="material-icons-outlined">sync</span>
                                {t('library.processing')}
                              </span>
                            )}
                            {book.status === 'Failed' && (
                              <span className="library-list-item__info-item library-list-item__info-item--error">
                                <span className="material-icons-outlined">error</span>
                                {t('library.failed')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="library-list-item__actions">
                          <BookActionMenu type="userbook" book={book} onChange={fetchUserBooks} />
                        </div>
                      </article>
                    )
                  })())}
                </div>
              ) : (
                <div className="library-page__grid">
                  {renderList.map((c) => c.kind === 'saved' ? (() => {
                    const item = c.item
                    const progress = progressMap[item.editionId]
                    const percent = progress?.percent ?? 0
                    const destination = progress?.chapterSlug
                      ? `/${item.language}/books/${item.slug}/${progress.chapterSlug}`
                      : `/${item.language}/books/${item.slug}`
                    return (
                      <div key={`saved-${item.editionId}`} className="library-card">
                        <Link to={destination} className="library-card__cover" title={`Read ${item.title} online`}>
                          {item.coverPath ? (
                            <img src={getStorageUrl(item.coverPath)} alt={item.title} />
                          ) : (
                            <div
                              className="library-card__cover-placeholder"
                              style={{ backgroundColor: stringToColor(item.title) }}
                            >
                              {item.title?.[0] || '?'}
                            </div>
                          )}
                          {percent >= 1 && (
                            <div className="user-book-card__completed-badge">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Read
                            </div>
                          )}
                          {percent > 0 && percent < 1 && (
                            <div className="library-card__progress-bar">
                              <div
                                className="library-card__progress-fill"
                                style={{ width: `${Math.round(percent * 100)}%` }}
                              />
                            </div>
                          )}
                        </Link>
                        <div className="library-card__info">
                          <div className="library-card__text">
                            <Link to={destination} className="library-card__title" title={item.title}>
                              {item.title}
                            </Link>
                            {item.author && (
                              <span className="user-book-card__author" title={item.author}>{item.author}</span>
                            )}
                            <div className="library-card__meta">
                              {percent >= 1 && (
                                <span className="user-book-card__progress-text user-book-card__progress-text--done">Read</span>
                              )}
                              {percent > 0 && percent < 1 && (
                                <span className="library-card__progress-text">
                                  {Math.round(percent * 100)}% {t('library.read')}
                                </span>
                              )}
                              <OfflineBadge editionId={item.editionId} />
                            </div>
                          </div>
                          <BookActionMenu
                            type="saved"
                            book={item}
                            isFinished={percent >= 1}
                            onRemove={() => remove(item.editionId)}
                            onMarkFinished={() => handleMarkRead(item.editionId, item.slug, item.language)}
                            onMarkUnfinished={() => handleMarkUnread(item.editionId, item.slug, item.language)}
                          />
                        </div>
                      </div>
                    )
                  })() : (() => {
                    const book = c.book
                    const hit = excerptByBookId.get(book.id)
                    return (
                      <UserBookCard
                        key={`upload-${book.id}`}
                        book={book}
                        onDelete={fetchUserBooks}
                        onRetry={fetchUserBooks}
                        onUpdate={fetchUserBooks}
                        progress={{ percent: book.progressPercent, chapterSlug: book.progressChapterSlug, updatedAt: book.progressUpdatedAt }}
                        highlighted={highlightedBookId === book.id}
                        selectable={selection.active}
                        selected={selection.isSelected(book.id)}
                        onSelectToggle={selection.toggle}
                        excerpt={hit?.excerpt ?? null}
                        excerptChapterSlug={hit?.chapterSlug ?? null}
                        excerptQuery={contentSearchQuery}
                      />
                    )
                  })())}
                </div>
              )}
            </div>
          )
        })()}

      </main>

      {/* FAB */}
      {showUploadsBlock && !selection.active && (
        <button
          className="library-fab"
          onClick={() => setShowUploadModal(true)}
          aria-label="Upload book"
        >
          <span className="material-icons-outlined">add</span>
        </button>
      )}

      {selection.active && showUploadsBlock && (
        <BulkActionBar
          count={selection.count}
          onCancel={selection.exit}
          onSelectAll={onSelectAllVisible}
          onMarkFinished={onBulkFinish}
          onDelete={onBulkDelete}
          onAddTag={onBulkAddTag}
          onAddToCollection={onBulkAddToCollection}
          busy={bulkBusy}
        />
      )}
    </div>
    <Footer />
    </>
  )
}

function formatTimeAgo(dateStr: string, t: (key: string) => string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return t('library.timeJustNow')
  if (diffMins < 60) return `${diffMins} ${t('library.timeMinAgo')}`
  if (diffHours < 24) return `${diffHours} ${t('library.timeHoursAgo')}`
  if (diffDays === 1) return t('library.timeYesterday')
  if (diffDays < 7) return `${diffDays} ${t('library.timeDaysAgo')}`
  return date.toLocaleDateString()
}
