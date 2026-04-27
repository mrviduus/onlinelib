import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { deleteUserBook, retryUserBook, cancelUserBook, markUserBookComplete, unmarkUserBookComplete, getUserBookCoverUrl, type UserBook } from '../../api/userBooks'
import { useLanguage } from '../../context/LanguageContext'
import { BookStatusBadge } from './BookStatusBadge'
import { GeneratedCover } from './GeneratedCover'

const NEW_BADGE_TTL_MS = 24 * 60 * 60 * 1000

interface UserBookCardProps {
  book: UserBook
  onDelete: () => void
  onRetry?: () => void
  onCancel?: () => void
  onUpdate?: () => void
  progress?: { percent: number | null; chapterSlug: string | null; updatedAt: string | null }
  highlighted?: boolean
}

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function isNew(createdAt: string): boolean {
  const t = new Date(createdAt).getTime()
  if (!t) return false
  return Date.now() - t < NEW_BADGE_TTL_MS
}

export function UserBookCard({ book, onDelete, onRetry, onCancel, onUpdate, progress, highlighted }: UserBookCardProps) {
  const { language } = useLanguage()
  const percent = progress?.percent ?? 0
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)

  const isProcessing = book.status === 'Processing'

  // Track elapsed time for processing books
  useEffect(() => {
    if (!isProcessing) return

    const startTime = new Date(book.createdAt).getTime()
    const updateElapsed = () => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }

    updateElapsed()
    const timer = setInterval(updateElapsed, 1000)
    return () => clearInterval(timer)
  }, [isProcessing, book.createdAt])

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const handleDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      await deleteUserBook(book.id)
      onDelete()
    } catch (err) {
      console.error('Failed to delete book:', err)
    } finally {
      setDeleting(false)
      setMenuOpen(false)
    }
  }

  const handleRetry = async () => {
    if (retrying) return
    setRetrying(true)
    try {
      await retryUserBook(book.id)
      onRetry?.()
    } catch (err) {
      console.error('Failed to retry book:', err)
    } finally {
      setRetrying(false)
      setMenuOpen(false)
    }
  }

  const handleCancel = async () => {
    if (cancelling) return
    setCancelling(true)
    try {
      await cancelUserBook(book.id)
      onCancel?.()
    } catch (err) {
      console.error('Failed to cancel book:', err)
    } finally {
      setCancelling(false)
      setMenuOpen(false)
    }
  }

  const isReady = book.status === 'Ready'
  const isFailed = book.status === 'Failed'
  const isStuck = isProcessing && elapsed > 30 // 30 seconds

  const destination = isReady
    ? (progress?.chapterSlug ? `/${language}/library/my/${book.id}/read/${progress.chapterSlug}` : `/${language}/library/my/${book.id}`)
    : '#'

  return (
    <div className={`user-book-card${highlighted ? ' user-book-card--highlighted' : ''}`}>
      <Link
        to={destination}
        className={`user-book-card__cover ${!isReady ? 'user-book-card__cover--disabled' : ''}`}
        onClick={(e) => !isReady && e.preventDefault()}
      >
        {book.coverPath ? (
          <img
            src={getUserBookCoverUrl(book.coverPath)}
            alt={book.title}
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden') }}
          />
        ) : null}
        <GeneratedCover
          title={book.title || '?'}
          author={book.author}
          className={book.coverPath ? 'hidden' : ''}
        />

        <div className="user-book-card__badges">
          {isProcessing && (
            <BookStatusBadge
              variant="processing"
              title={`${formatElapsed(elapsed)}${isStuck ? ' — possible issue' : ''}`}
            />
          )}
          {isFailed && (
            <BookStatusBadge
              variant="failed"
              onClick={(e) => { e?.stopPropagation?.(); e?.preventDefault?.(); handleRetry() }}
              title={book.errorMessage || 'Tap to retry'}
            />
          )}
          {isReady && !book.completedAt && isNew(book.createdAt) && (
            <BookStatusBadge variant="new" />
          )}
        </div>

        {isReady && book.completedAt && (
          <div className="user-book-card__finished-badge" aria-label="Read">
            <BookStatusBadge variant="finished" />
          </div>
        )}

        {isReady && !book.completedAt && percent > 0 && (
          <div className="user-book-card__progress-bar">
            <div
              className="user-book-card__progress-fill"
              style={{ width: `${Math.round(percent * 100)}%` }}
            />
          </div>
        )}
      </Link>

      <div className="user-book-card__info">
        <div className="user-book-card__text">
          <Link
            to={destination}
            className="user-book-card__title"
            onClick={(e) => !isReady && e.preventDefault()}
          >
            {book.title}
          </Link>
          {book.author && (
            <div className="user-book-card__author">{book.author}</div>
          )}
          <div className="user-book-card__meta">
            {isReady && book.completedAt && (
              <span className="user-book-card__progress-text user-book-card__progress-text--done">Read</span>
            )}
            {isReady && !book.completedAt && percent > 0 && (
              <span className="user-book-card__progress-text">{Math.round(percent * 100)}% read</span>
            )}
            {isReady && !book.completedAt && book.chapterCount > 0 && percent === 0 && (
              <span>{book.chapterCount} chapters</span>
            )}
            {isFailed && book.errorMessage && (
              <span className="user-book-card__error" title={book.errorMessage}>
                {book.errorMessage.length > 40
                  ? book.errorMessage.slice(0, 40) + '...'
                  : book.errorMessage}
              </span>
            )}
          </div>
        </div>

        <div className="user-book-card__menu" ref={menuRef}>
          <button
            className="user-book-card__menu-trigger"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            title="Options"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>

          {menuOpen && (
            <div className="user-book-card__dropdown" role="menu">
              {isReady && (
                <Link
                  to={`/${language}/library/my/${book.id}`}
                  className="user-book-card__item"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                  View details
                </Link>
              )}

              {isReady && !book.completedAt && (
                <button
                  className="user-book-card__item"
                  onClick={async () => {
                    await markUserBookComplete(book.id)
                    onUpdate?.()
                    setMenuOpen(false)
                  }}
                  role="menuitem"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Mark as read
                </button>
              )}

              {isReady && book.completedAt && (
                <button
                  className="user-book-card__item"
                  onClick={async () => {
                    await unmarkUserBookComplete(book.id)
                    onUpdate?.()
                    setMenuOpen(false)
                  }}
                  role="menuitem"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  Mark as unread
                </button>
              )}

              {isFailed && (
                <button
                  className="user-book-card__item"
                  onClick={handleRetry}
                  disabled={retrying}
                  role="menuitem"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 4v6h-6M1 20v-6h6" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  {retrying ? 'Retrying...' : 'Retry'}
                </button>
              )}

              {isProcessing && (
                <button
                  className="user-book-card__item user-book-card__item--danger"
                  onClick={handleCancel}
                  disabled={cancelling}
                  role="menuitem"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M15 9l-6 6M9 9l6 6" />
                  </svg>
                  {cancelling ? 'Cancelling...' : 'Cancel'}
                </button>
              )}

              <button
                className="user-book-card__item user-book-card__item--danger"
                onClick={handleDelete}
                disabled={deleting}
                role="menuitem"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
