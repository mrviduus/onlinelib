import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLibrary } from '../hooks/useLibrary'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import { SeoHead } from '../components/SeoHead'
import { Footer } from '../components/Footer'
import { OfflineBadge } from '../components/OfflineBadge'
import { BookCardMenu } from '../components/library/BookCardMenu'
import { UploadSection } from '../components/library/UploadSection'
import { UserBookCard } from '../components/library/UserBookCard'
import { UserBookMenu } from '../components/library/UserBookMenu'
import { EmptyState } from '../components/EmptyState'
import { createApi, getStorageUrl } from '../api/client'
import { getUserBooks, getUserBookCoverUrl, type UserBook } from '../api/userBooks'
import { getAllRatings, type UserRatingDto } from '../api/userRatings'
import { stringToColor } from '../utils/colors'
import { getAllProgress, ReadingProgressDto, markAsRead, markAsUnread } from '../api/auth'

type ViewMode = 'list' | 'grid'
type SortOption = 'recent' | 'title' | 'progress'
type SidebarTab = 'saved' | 'uploads' | 'reviews'

export function LibraryPage() {
  const { isAuthenticated, isGuest, isLoading: authLoading, user } = useAuth()
  const { items, loading, remove } = useLibrary()
  const { language } = useLanguage()
  const { t } = useTranslation()
  const [progressMap, setProgressMap] = useState<Record<string, ReadingProgressDto>>({})
  const [activeTab, setActiveTab] = useState<SidebarTab>(isGuest ? 'uploads' : 'saved')
  const [userBooks, setUserBooks] = useState<UserBook[]>([])
  const [userBooksLoading, setUserBooksLoading] = useState(false)
  const [myReviews, setMyReviews] = useState<UserRatingDto[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('library-view') as ViewMode) || 'list'
  })
  const [sortBy, setSortBy] = useState<SortOption>('recent')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)

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

  // Fetch my reviews when tab is active
  useEffect(() => {
    if (activeTab !== 'reviews' || !isAuthenticated) return
    setReviewsLoading(true)
    getAllRatings()
      .then((ratings) => setMyReviews(ratings.filter((r) => r.reviewText)))
      .catch(() => {})
      .finally(() => setReviewsLoading(false))
  }, [activeTab, isAuthenticated])


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

  // Sort items
  const sortedItems = [...items].sort((a, b) => {
    switch (sortBy) {
      case 'title':
        return a.title.localeCompare(b.title)
      case 'progress':
        const pA = progressMap[a.editionId]?.percent ?? 0
        const pB = progressMap[b.editionId]?.percent ?? 0
        return pB - pA
      default:
        return 0
    }
  })

  // Sort user books
  const sortedUserBooks = [...userBooks].sort((a, b) => {
    switch (sortBy) {
      case 'title':
        return a.title.localeCompare(b.title)
      case 'recent': {
        const aDate = a.progressUpdatedAt || a.createdAt
        const bDate = b.progressUpdatedAt || b.createdAt
        return new Date(bDate).getTime() - new Date(aDate).getTime()
      }
      case 'progress':
        return (b.progressPercent ?? 0) - (a.progressPercent ?? 0)
      default:
        return 0
    }
  })

  const sortLabels: Record<SortOption, string> = {
    recent: t('library.sortRecent'),
    title: t('library.sortTitle'),
    progress: t('library.sortProgress')
  }

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
          <button
            className={`library-sidebar__btn ${activeTab === 'reviews' ? 'library-sidebar__btn--active' : ''}`}
            onClick={() => setActiveTab('reviews')}
          >
            <span className="material-icons-outlined">rate_review</span>
            <span>{t('reviews.myReviews')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="library-main">
        <header className="library-header">
          <h1 className="library-header__title">{t('library.title')}</h1>
          {user && <p className="library-header__email">{user.email}</p>}
        </header>

        {activeTab === 'saved' && (
          <>
            {/* Toolbar */}
            <div className="library-toolbar">
              <div className="library-toolbar__left">
                <div className="library-sort">
                  <button
                    className="library-sort__trigger"
                    onClick={() => setShowSortMenu(!showSortMenu)}
                  >
                    {t('library.sortBy')}: {sortLabels[sortBy]}
                    <span className="material-icons-outlined">expand_more</span>
                  </button>
                  {showSortMenu && (
                    <>
                      <div className="library-sort__backdrop" onClick={() => setShowSortMenu(false)} />
                      <div className="library-sort__menu">
                        {(Object.keys(sortLabels) as SortOption[]).map((key) => (
                          <button
                            key={key}
                            className={`library-sort__option ${sortBy === key ? 'library-sort__option--active' : ''}`}
                            onClick={() => { setSortBy(key); setShowSortMenu(false) }}
                          >
                            {sortLabels[key]}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
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

            {loading ? (
              <div className="library-page__loading">{t('library.loading')}</div>
            ) : sortedItems.length === 0 ? (
              <EmptyState icon="📖" title={t('library.emptyLibrary')} buttonLabel={t('library.browseBooks')} buttonTo="/books" />
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
                        <BookCardMenu
                          book={item}
                          isRead={percent >= 1}
                          onRemove={() => remove(item.editionId)}
                          onMarkRead={() => handleMarkRead(item.editionId, item.slug, item.language)}
                          onMarkUnread={() => handleMarkUnread(item.editionId, item.slug, item.language)}
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
                        <BookCardMenu
                          book={item}
                          isRead={percent >= 1}
                          onRemove={() => remove(item.editionId)}
                          onMarkRead={() => handleMarkRead(item.editionId, item.slug, item.language)}
                          onMarkUnread={() => handleMarkUnread(item.editionId, item.slug, item.language)}
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
                <div className="library-sort">
                  <button
                    className="library-sort__trigger"
                    onClick={() => setShowSortMenu(!showSortMenu)}
                  >
                    {t('library.sortBy')}: {sortLabels[sortBy]}
                    <span className="material-icons-outlined">expand_more</span>
                  </button>
                  {showSortMenu && (
                    <>
                      <div className="library-sort__backdrop" onClick={() => setShowSortMenu(false)} />
                      <div className="library-sort__menu">
                        {(Object.keys(sortLabels) as SortOption[]).map((key) => (
                          <button
                            key={key}
                            className={`library-sort__option ${sortBy === key ? 'library-sort__option--active' : ''}`}
                            onClick={() => { setSortBy(key); setShowSortMenu(false) }}
                          >
                            {sortLabels[key]}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
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

            {userBooksLoading && userBooks.length === 0 ? (
              <div className="library-page__loading">{t('library.loading')}</div>
            ) : userBooks.length === 0 ? (
              <EmptyState icon="☁️" title={t('library.noUploads')} subtitle={t('library.uploadHint')} />
            ) : viewMode === 'list' ? (
              <div className="library-list">
                {sortedUserBooks.map((book) => {
                  const isReady = book.status === 'Ready'
                  const percent = book.progressPercent ?? 0
                  const destination = isReady
                    ? (book.progressChapterSlug ? `/${language}/library/my/${book.id}/read/${book.progressChapterSlug}` : `/${language}/library/my/${book.id}`)
                    : '#'
                  const coverUrl = getUserBookCoverUrl(book.coverPath)
                  return (
                    <article key={book.id} className="library-list-item">
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
                        <UserBookMenu book={book} onAction={fetchUserBooks} />
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
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'reviews' && (
          <>
            {reviewsLoading ? (
              <div className="library-page__loading">{t('library.loading')}</div>
            ) : myReviews.length === 0 ? (
              <EmptyState icon="⭐" title={t('reviews.noMyReviews')} buttonLabel={t('library.browseBooks')} buttonTo="/books" />
            ) : (
              <div className="library-list">
                {myReviews.map((review) => {
                  const destination = review.editionSlug && review.editionLanguage
                    ? `/${review.editionLanguage}/books/${review.editionSlug}`
                    : '#'
                  return (
                    <article key={review.id} className="library-list-item">
                      <Link to={destination} className="library-list-item__cover">
                        {review.editionCoverPath ? (
                          <img src={getStorageUrl(review.editionCoverPath)} alt={review.editionTitle || ''} />
                        ) : (
                          <div
                            className="library-list-item__cover-placeholder"
                            style={{ backgroundColor: stringToColor(review.editionTitle || '') }}
                          >
                            {review.editionTitle?.[0] || '?'}
                          </div>
                        )}
                      </Link>
                      <div className="library-list-item__content">
                        <Link to={destination} className="library-list-item__title">
                          {review.title || review.editionTitle || t('reviews.untitled')}
                        </Link>
                        <div className="library-review__stars">
                          {Array.from({ length: 5 }, (_, i) => (
                            <span key={i} className={`material-icons-outlined library-review__star ${i < Math.round(review.rating) ? 'library-review__star--filled' : ''}`}>
                              {i < Math.round(review.rating) ? 'star' : 'star_outline'}
                            </span>
                          ))}
                        </div>
                        {review.reviewText && (
                          <p className="library-review__preview">{review.reviewText}</p>
                        )}
                        <div className="library-list-item__info">
                          <span className="library-list-item__info-item">
                            <span className="material-icons-outlined">thumb_up</span>
                            {review.helpfulCount}
                          </span>
                          <span className="library-list-item__info-item">
                            <span className="material-icons-outlined">chat_bubble_outline</span>
                            {review.commentCount}
                          </span>
                          <span className="library-list-item__info-item">
                            {new Date(review.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </article>
                  )
                })}
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
