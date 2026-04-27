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
import { ContinueReadingShelf } from '../components/library/ContinueReadingShelf'
import { LibrarySortMenu } from '../components/library/LibrarySortMenu'
import { LibraryFilters } from '../components/library/LibraryFilters'
import { LibrarySearch } from '../components/library/LibrarySearch'
import { useLibrarySort, sortLibraryItems, sortUserBooks } from '../hooks/useLibrarySort'
import {
  useLibraryFilter, filterLibraryItems, filterUserBooks, countsForLibrary, countsForUploads,
} from '../hooks/useLibraryFilter'
import { useLibrarySearch } from '../hooks/useLibrarySearch'
import { matchesQuery, parseQuery } from '../lib/searchUtils'
import { features } from '../lib/features'
import { useUserTags } from '../hooks/useUserTags'
import { UserBookCard } from '../components/library/UserBookCard'
import { CollectionChips } from '../components/library/CollectionChips'
import { getCollectionBookIds } from '../api/collections'
import { EmptyState } from '../components/EmptyState'
import { createApi, getStorageUrl } from '../api/client'
import { getUserBooks, getUserBookCoverUrl, type UserBook } from '../api/userBooks'
import { stringToColor } from '../utils/colors'
import { getAllProgress, ReadingProgressDto, markAsRead, markAsUnread } from '../api/auth'

type ViewMode = 'list' | 'grid'
type SidebarTab = 'saved' | 'uploads'

export function LibraryPage() {
  const { isAuthenticated, isGuest, isLoading: authLoading, user } = useAuth()
  const { items, loading, remove } = useLibrary()
  const { language } = useLanguage()
  const { t } = useTranslation()
  const [progressMap, setProgressMap] = useState<Record<string, ReadingProgressDto>>({})
  const [searchParams, setSearchParamsLib] = useSearchParams()
  const tabFromUrl = searchParams.get('tab')
  const initialTab: SidebarTab = tabFromUrl === 'uploads' ? 'uploads' : (isGuest ? 'uploads' : 'saved')
  const [activeTab, setActiveTab] = useState<SidebarTab>(initialTab)
  const highlightedBookId = useHighlightedBook()
  const [userBooks, setUserBooks] = useState<UserBook[]>([])
  const [userBooksLoading, setUserBooksLoading] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('library-view') as ViewMode) || 'list'
  })
  const { sort: savedSort, setSort: setSavedSort } = useLibrarySort('saved')
  const { sort: uploadsSort, setSort: setUploadsSort } = useLibrarySort('uploads')
  const { filter: savedFilter, setFilter: setSavedFilter } = useLibraryFilter('saved')
  const { filter: uploadsFilter, setFilter: setUploadsFilter } = useLibraryFilter('uploads')
  const { query: savedQuery, debouncedQuery: savedQueryD, setQuery: setSavedQuery, clear: clearSavedQuery } = useLibrarySearch('saved')
  const { query: uploadsQuery, debouncedQuery: uploadsQueryD, setQuery: setUploadsQuery, clear: clearUploadsQuery } = useLibrarySearch('uploads')
  const { tags: userTags } = useUserTags()
  const [showUploadModal, setShowUploadModal] = useState(false)
  const collectionIdParam = searchParams.get('collection')
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(collectionIdParam)
  const [collectionBookIds, setCollectionBookIds] = useState<Set<string> | null>(null)

  useEffect(() => {
    if (!features.myBooksV2.collections) return
    if (!activeCollectionId) { setCollectionBookIds(null); return }
    let cancelled = false
    const bookType = activeTab === 'uploads' ? 'userbook' : 'savedbook'
    getCollectionBookIds(activeCollectionId, bookType)
      .then((ids) => { if (!cancelled) setCollectionBookIds(new Set(ids)) })
      .catch(() => { if (!cancelled) setCollectionBookIds(new Set()) })
    return () => { cancelled = true }
  }, [activeCollectionId, activeTab])

  const onCollectionChange = (id: string | null) => {
    setActiveCollectionId(id)
    setSearchParamsLib((prev) => {
      const sp = new URLSearchParams(prev)
      if (id) sp.set('collection', id)
      else sp.delete('collection')
      return sp
    }, { replace: true })
  }

  const activeUploadTag = features.myBooksV2.tags ? (parseQuery(uploadsQueryD).tags[0] ?? null) : null
  const onUploadTagSelect = (tag: string | null) => {
    if (!tag) { setUploadsQuery(parseQuery(uploadsQueryD).text) ; return }
    const text = parseQuery(uploadsQueryD).text
    setUploadsQuery(text ? `tag:${tag} ${text}` : `tag:${tag}`)
  }

  // Persist view mode
  useEffect(() => {
    localStorage.setItem('library-view', viewMode)
  }, [viewMode])

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
  const filteredItems = filterLibraryItems(items, savedFilter, progressMap)
  const filteredUserBooks = filterUserBooks(userBooks, uploadsFilter)
  const searchedItems = savedQueryD ? filteredItems.filter(i => matchesQuery({ title: i.title }, savedQueryD)) : filteredItems
  const searchedUserBooks = uploadsQueryD ? filteredUserBooks.filter(b => matchesQuery({ title: b.title, author: b.author, tags: b.tags }, uploadsQueryD)) : filteredUserBooks
  const collectionFilteredItems = features.myBooksV2.collections && activeCollectionId && activeTab === 'saved' && collectionBookIds
    ? searchedItems.filter(i => collectionBookIds.has(i.editionId))
    : searchedItems
  const collectionFilteredUserBooks = features.myBooksV2.collections && activeCollectionId && activeTab === 'uploads' && collectionBookIds
    ? searchedUserBooks.filter(b => collectionBookIds.has(b.id))
    : searchedUserBooks
  const sortedItems = sortLibraryItems(collectionFilteredItems, savedSort, progressMap)
  const sortedUserBooks = sortUserBooks(collectionFilteredUserBooks, uploadsSort)

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
      <aside className="library-sidebar">
        <div className="library-sidebar__inner">
          <button
            className={`library-sidebar__btn ${activeTab === 'saved' ? 'library-sidebar__btn--active' : ''}`}
            onClick={() => setActiveTab('saved')}
          >
            <span className="material-icons-outlined">book</span>
            <span>{t('library.saved')}</span>
            {items.length > 0 && <span className="library-sidebar__count">{items.length}</span>}
          </button>
          <button
            className={`library-sidebar__btn ${activeTab === 'uploads' ? 'library-sidebar__btn--active' : ''}`}
            onClick={() => setActiveTab('uploads')}
          >
            <span className="material-icons-outlined">file_upload</span>
            <span>{t('library.uploads')}</span>
            {userBooks.length > 0 && <span className="library-sidebar__count">{userBooks.length}</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="library-main">
        <header className="library-header">
          <h1 className="library-header__title">{t('library.title')}</h1>
          {user && <p className="library-header__email">{user.email}</p>}
        </header>

        {features.myBooksV2.continueReading && <ContinueReadingShelf />}

        {features.myBooksV2.collections && (
          <CollectionChips activeId={activeCollectionId} onSelect={onCollectionChange} />
        )}

        {activeTab === 'saved' && (
          <>
            {/* Toolbar */}
            <div className="library-toolbar">
              <div className="library-toolbar__left">
                <LibrarySortMenu value={savedSort} onChange={setSavedSort} />
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

            {items.length > 0 && (
              <>
                <LibrarySearch value={savedQuery} onChange={setSavedQuery} />
                <LibraryFilters value={savedFilter} onChange={setSavedFilter} counts={savedCounts} />
              </>
            )}

            {loading ? (
              <div className="library-page__loading">{t('library.loading')}</div>
            ) : items.length === 0 ? (
              <EmptyState icon="📖" title={t('library.emptyLibrary')} buttonLabel={t('library.browseBooks')} buttonTo="/books" />
            ) : sortedItems.length === 0 ? (
              savedQueryD ? (
                <div className="library-filters__empty">
                  <p>{t('library.search.empty').replace('{query}', savedQueryD)}</p>
                  <button type="button" onClick={clearSavedQuery}>{t('library.search.clear')}</button>
                </div>
              ) : (
                <div className="library-filters__empty">
                  <p>{t('library.filter.empty')}</p>
                  <button type="button" onClick={() => setSavedFilter('all')}>{t('library.filter.clear')}</button>
                </div>
              )
            ) : viewMode === 'list' ? (
              <div className="library-list">
                {sortedItems.map((item) => {
                  const progress = progressMap[item.editionId]
                  const percent = progress?.percent ?? 0
                  const destination = progress?.chapterSlug
                    ? `/${item.language}/books/${item.slug}/${progress.chapterSlug}`
                    : `/${item.language}/books/${item.slug}`
                  return (
                    <article key={item.editionId} className="library-list-item">
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
                        <Link to={destination} className="library-list-item__title">
                          {item.title}
                        </Link>

                        {/* Progress bar */}
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
                })}
              </div>
            ) : (
              <div className="library-page__grid">
                {sortedItems.map((item) => {
                  const progress = progressMap[item.editionId]
                  const percent = progress?.percent ?? 0
                  const destination = progress?.chapterSlug
                    ? `/${item.language}/books/${item.slug}/${progress.chapterSlug}`
                    : `/${item.language}/books/${item.slug}`
                  return (
                    <div key={item.editionId} className="library-card">
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
                          <Link to={destination} className="library-card__title">
                            {item.title}
                          </Link>
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
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'uploads' && (
          <>
            {showUploadModal && (
              <UploadSection onUploadComplete={() => { fetchUserBooks(); setShowUploadModal(false) }} />
            )}

            {/* Toolbar */}
            <div className="library-toolbar">
              <div className="library-toolbar__left">
                <LibrarySortMenu value={uploadsSort} onChange={setUploadsSort} />
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

            {userBooks.length > 0 && (
              <>
                <LibrarySearch value={uploadsQuery} onChange={setUploadsQuery} />
                <LibraryFilters
                  value={uploadsFilter}
                  onChange={setUploadsFilter}
                  counts={uploadsCounts}
                  tags={features.myBooksV2.tags ? userTags : undefined}
                  activeTag={activeUploadTag}
                  onTagClick={features.myBooksV2.tags ? onUploadTagSelect : undefined}
                />
              </>
            )}

            {userBooksLoading && userBooks.length === 0 ? (
              <div className="library-page__loading">{t('library.loading')}</div>
            ) : userBooks.length === 0 ? (
              <UploadDropZone />
            ) : sortedUserBooks.length === 0 ? (
              uploadsQueryD ? (
                <div className="library-filters__empty">
                  <p>{t('library.search.empty').replace('{query}', uploadsQueryD)}</p>
                  <button type="button" onClick={clearUploadsQuery}>{t('library.search.clear')}</button>
                </div>
              ) : (
                <div className="library-filters__empty">
                  <p>{t('library.filter.empty')}</p>
                  <button type="button" onClick={() => setUploadsFilter('all')}>{t('library.filter.clear')}</button>
                </div>
              )
            ) : viewMode === 'list' ? (
              <div className="library-list">
                {sortedUserBooks.map((book) => {
                  const isReady = book.status === 'Ready'
                  const percent = book.progressPercent ?? 0
                  const destination = isReady
                    ? (book.progressChapterSlug ? `/${language}/library/my/${book.id}/read/${book.progressChapterSlug}` : `/${language}/library/my/${book.id}`)
                    : '#'
                  const coverUrl = getUserBookCoverUrl(book.coverPath)
                  const isHighlighted = highlightedBookId === book.id
                  return (
                    <article key={book.id} className={`library-list-item${isHighlighted ? ' library-list-item--highlighted' : ''}`}>
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

                        {/* Progress bar for ready books */}
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
                })}
              </div>
            ) : (
              <div className="library-page__grid">
                {sortedUserBooks.map((book) => (
                  <UserBookCard
                    key={book.id}
                    book={book}
                    onDelete={fetchUserBooks}
                    onRetry={fetchUserBooks}
                    onUpdate={fetchUserBooks}
                    progress={{ percent: book.progressPercent, chapterSlug: book.progressChapterSlug, updatedAt: book.progressUpdatedAt }}
                    highlighted={highlightedBookId === book.id}
                  />
                ))}
              </div>
            )}
          </>
        )}

      </main>

      {/* FAB */}
      {activeTab === 'uploads' && (
        <button
          className="library-fab"
          onClick={() => setShowUploadModal(true)}
          aria-label="Upload book"
        >
          <span className="material-icons-outlined">add</span>
        </button>
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
