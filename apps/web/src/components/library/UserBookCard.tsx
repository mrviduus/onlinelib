import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getUserBookCoverUrl, type UserBook } from '../../api/userBooks'
import { useLanguage } from '../../context/LanguageContext'
import { BookStatusBadge } from './BookStatusBadge'
import { GeneratedCover } from './GeneratedCover'
import { BookActionMenu } from './BookActionMenu'
import { TagPill } from './TagPill'
import { features } from '../../lib/features'

const NEW_BADGE_TTL_MS = 24 * 60 * 60 * 1000

interface UserBookCardProps {
  book: UserBook
  onDelete: () => void
  onRetry?: () => void
  onCancel?: () => void
  onUpdate?: () => void
  progress?: { percent: number | null; chapterSlug: string | null; updatedAt: string | null }
  highlighted?: boolean
  selectable?: boolean
  selected?: boolean
  onSelectToggle?: (id: string) => void
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

export function UserBookCard({ book, onDelete, onRetry, onCancel, onUpdate, progress, highlighted, selectable, selected, onSelectToggle }: UserBookCardProps) {
  const { language } = useLanguage()
  const percent = progress?.percent ?? 0
  const [elapsed, setElapsed] = useState(0)
  const [, setSearchParams] = useSearchParams()
  const filterByTag = (tag: string) => {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev)
      sp.set('tab', 'uploads')
      sp.set('q', `tag:${tag}`)
      return sp
    }, { replace: false })
  }

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

  const onChange = () => {
    onUpdate?.()
    onRetry?.()
    onCancel?.()
    onDelete()
  }

  const isReady = book.status === 'Ready'
  const isFailed = book.status === 'Failed'
  const isStuck = isProcessing && elapsed > 30

  const destination = isReady
    ? (progress?.chapterSlug ? `/${language}/library/my/${book.id}/read/${progress.chapterSlug}` : `/${language}/library/my/${book.id}`)
    : '#'

  const cardClasses = [
    'user-book-card',
    highlighted ? 'user-book-card--highlighted' : '',
    selectable ? 'user-book-card--selectable' : '',
    selected ? 'user-book-card--selected' : '',
  ].filter(Boolean).join(' ')

  const onCardClickCapture = (e: React.MouseEvent) => {
    if (!selectable || !onSelectToggle) return
    e.preventDefault()
    e.stopPropagation()
    onSelectToggle(book.id)
  }

  return (
    <div className={cardClasses} onClickCapture={onCardClickCapture}>
      {selectable && (
        <label className="user-book-card__check" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={!!selected}
            onChange={() => onSelectToggle?.(book.id)}
            aria-label={`Select ${book.title}`}
          />
        </label>
      )}
      <div className="user-book-card__cover-wrap">
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

          {isReady && !book.completedAt && percent > 0 && (
            <div className="user-book-card__progress-bar">
              <div
                className="user-book-card__progress-fill"
                style={{ width: `${Math.round(percent * 100)}%` }}
              />
            </div>
          )}
        </Link>

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
      </div>

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
          {features.myBooksV2.tags && book.tags && book.tags.length > 0 && (
            <div className="user-book-card__tags">
              {book.tags.slice(0, 4).map((tag) => (
                <TagPill key={tag} tag={tag} onClick={() => filterByTag(tag)} />
              ))}
              {book.tags.length > 4 && (
                <span className="user-book-card__tags-more">+{book.tags.length - 4}</span>
              )}
            </div>
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

        <BookActionMenu type="userbook" book={book} onChange={onChange} />
      </div>
    </div>
  )
}
