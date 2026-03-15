import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { getUserBook, deleteUserBook, markUserBookComplete, unmarkUserBookComplete, getUserBookCoverUrl, type UserBookDetail } from '../api/userBooks'
import { SeoHead } from '../components/SeoHead'
import { Footer } from '../components/Footer'
import { stringToColor } from '../utils/colors'
import { ShareButtons } from '../components/ShareButtons'
import { StarRating } from '../components/StarRating'
import { MoodSelector } from '../components/MoodSelector'

interface SavedProgress {
  chapterSlug?: string
  chapterNumber?: number // legacy format
  page: number
  percent: number
}

export function UserBookDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const { language } = useLanguage()
  const [book, setBook] = useState<UserBookDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Get saved progress from localStorage
  const savedProgress = useMemo((): SavedProgress | null => {
    if (!id) return null
    try {
      const stored = localStorage.getItem(`userbook.progress.${id}`)
      if (!stored) return null
      return JSON.parse(stored) as SavedProgress
    } catch {
      return null
    }
  }, [id])

  // Determine continue reading target
  const continueReadingSlug = useMemo(() => {
    if (!savedProgress || !book?.chapters) return null

    // New format: chapterSlug
    if (savedProgress.chapterSlug) {
      const chapter = book.chapters.find(c => c.slug === savedProgress.chapterSlug)
      if (chapter) return chapter.slug || String(chapter.chapterNumber)
    }

    // Legacy format: chapterNumber
    if (savedProgress.chapterNumber) {
      const chapter = book.chapters.find(c => c.chapterNumber === savedProgress.chapterNumber)
      if (chapter) return chapter.slug || String(chapter.chapterNumber)
    }

    return null
  }, [savedProgress, book?.chapters])

  useEffect(() => {
    if (!id || !isAuthenticated) return

    let cancelled = false
    setLoading(true)
    setError(null)

    getUserBook(id)
      .then((data) => {
        if (!cancelled) setBook(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [id, isAuthenticated])

  // Auto-refresh while processing
  useEffect(() => {
    if (!book || book.status !== 'Processing') return
    const interval = setInterval(() => {
      getUserBook(id!)
        .then(setBook)
        .catch(() => {})
    }, 5000)
    return () => clearInterval(interval)
  }, [book?.status, id])

  const handleDelete = async () => {
    if (!id || deleting) return
    if (!confirm('Are you sure you want to delete this book?')) return

    setDeleting(true)
    try {
      await deleteUserBook(id)
      navigate(`/${language}/library`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <>
      <div className="user-book-detail">
        <SeoHead title="My Book" noindex />
        <div className="user-book-detail__empty">
          <p>Sign in to view your uploaded books.</p>
        </div>
      </div>
      <Footer />
      </>
    )
  }

  if (loading) {
    return (
      <>
      <div className="user-book-detail">
        <SeoHead title="Loading..." noindex />
        <div className="user-book-detail__loading">Loading...</div>
      </div>
      <Footer />
      </>
    )
  }

  if (error || !book) {
    return (
      <>
      <div className="user-book-detail">
        <SeoHead title="Book Not Found" noindex />
        <div className="user-book-detail__error">
          <h2>Error</h2>
          <p>{error || 'Book not found'}</p>
          <Link to={`/${language}/library`} className="user-book-detail__back">
            Back to Library
          </Link>
        </div>
      </div>
      <Footer />
      </>
    )
  }

  const isReady = book.status === 'Ready'
  const isProcessing = book.status === 'Processing'
  const isFailed = book.status === 'Failed'

  return (
    <>
    <div className="user-book-detail">
      <SeoHead title={book.title} noindex />

      <div className="user-book-detail__header">
        <Link to={`/${language}/library`} className="user-book-detail__back-link">
          ← Back to Library
        </Link>
      </div>

      <div className="user-book-detail__content">
        <div className="user-book-detail__cover">
          {book.coverPath ? (
            <img src={getUserBookCoverUrl(book.coverPath)} alt={book.title} />
          ) : (
            <div
              className="user-book-detail__cover-placeholder"
              style={{ backgroundColor: stringToColor(book.title) }}
            >
              {book.title?.[0] || '?'}
            </div>
          )}
        </div>

        <div className="user-book-detail__info">
          <h1 className="user-book-detail__title">{book.title}</h1>

          {book.author && (
            <p className="user-book-detail__author">{book.author}</p>
          )}

          {book.description && (
            <p className="user-book-detail__description">{book.description}</p>
          )}

          <div className="user-book-detail__meta">
            <span>Language: {book.language}</span>
            {book.genre && <span>{book.genre}</span>}
            {book.publishedYear && <span>{book.publishedYear}</span>}
            {isReady && <span>{book.chapters.length} chapters</span>}
            {book.totalWordCount != null && book.totalWordCount > 0 && (
              <span>{Math.round(book.totalWordCount / 250).toLocaleString()} pages</span>
            )}
          </div>

          {isProcessing && (
            <div className="user-book-detail__status user-book-detail__status--processing">
              <span className="user-book-detail__spinner" />
              Processing... This may take a few minutes.
            </div>
          )}

          {isFailed && (
            <div className="user-book-detail__status user-book-detail__status--failed">
              <strong>Processing Failed</strong>
              {book.errorMessage && <p>{book.errorMessage}</p>}
            </div>
          )}

          {isReady && (
            <>
              <StarRating userBookId={book.id} />
              <MoodSelector userBookId={book.id} />
            </>
          )}

          {isReady && book.completedAt && (
            <div className="user-book-detail__completed">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Read
            </div>
          )}

          <div className="user-book-detail__actions">
            {isReady && book.chapters.length > 0 && (
              <Link
                to={`/${language}/library/my/${book.id}/read/${continueReadingSlug || book.chapters[0].slug || book.chapters[0].chapterNumber}`}
                className="user-book-detail__read-btn"
              >
                {continueReadingSlug ? 'Continue Reading' : 'Start Reading'}
              </Link>
            )}

            {isReady && !book.completedAt && (
              <button
                onClick={async () => {
                  await markUserBookComplete(book.id)
                  setBook({ ...book, completedAt: new Date().toISOString() })
                }}
                className="user-book-detail__mark-btn"
              >
                Mark as read
              </button>
            )}

            {isReady && book.completedAt && (
              <button
                onClick={async () => {
                  await unmarkUserBookComplete(book.id)
                  setBook({ ...book, completedAt: null })
                }}
                className="user-book-detail__mark-btn"
              >
                Mark as unread
              </button>
            )}

            <button
              onClick={handleDelete}
              disabled={deleting}
              className="user-book-detail__delete-btn"
            >
              {deleting ? 'Deleting...' : 'Delete Book'}
            </button>

            {isReady && (
              <ShareButtons
                url={window.location.href}
                title={book.title}
                subtitle={book.author || undefined}
                linkOnly
              />
            )}
          </div>
        </div>
      </div>

      {isReady && book.chapters.length > 0 && (
        <div className="user-book-detail__chapters">
          <h2>Chapters</h2>
          <ul className="user-book-detail__chapter-list">
            {book.chapters.map((chapter) => (
              <li key={chapter.id}>
                <Link to={`/${language}/library/my/${book.id}/read/${chapter.slug || chapter.chapterNumber}`}>
                  <span className="user-book-detail__chapter-number">
                    {chapter.chapterNumber}.
                  </span>
                  <span className="user-book-detail__chapter-title">
                    {chapter.title}
                  </span>
                  {chapter.wordCount && (
                    <span className="user-book-detail__chapter-words">
                      {chapter.wordCount.toLocaleString()} words
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
    <Footer />
    </>
  )
}
