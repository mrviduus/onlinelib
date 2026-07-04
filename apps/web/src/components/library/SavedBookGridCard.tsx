// Saved (catalog) book card in the library grid view. Extracted verbatim from
// LibraryPage.tsx (R6 slice-1) — presentational; `key` stays at the call site.
import { Link } from 'react-router-dom'
import { getStorageUrl } from '../../api/client'
import type { LibraryItem, ReadingProgressDto } from '../../api/auth'
import { OfflineBadge } from '../OfflineBadge'
import { BookActionMenu } from './BookActionMenu'
import { stringToColor } from '../../utils/colors'

export function SavedBookGridCard({
  item,
  progress,
  t,
  onRemove,
  onMarkFinished,
  onMarkUnfinished,
}: {
  item: LibraryItem
  progress: ReadingProgressDto | undefined
  t: (key: string) => string
  onRemove: () => void
  onMarkFinished: () => void
  onMarkUnfinished: () => void
}) {
  const percent = progress?.percent ?? 0
  const destination = progress?.chapterSlug
    ? `/${item.language}/books/${item.slug}/${progress.chapterSlug}`
    : `/${item.language}/books/${item.slug}`
  return (
    <div className="library-card">
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
          onRemove={onRemove}
          onMarkFinished={onMarkFinished}
          onMarkUnfinished={onMarkUnfinished}
        />
      </div>
    </div>
  )
}
