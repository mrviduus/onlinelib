import { LocalizedLink } from '../LocalizedLink'
import type { ChapterNav } from '../../types/api'

interface Props {
  bookSlug: string
  prev: ChapterNav | null
  next: ChapterNav | null
  currentChapter: number
  totalChapters: number
}

export function ReaderFooterNav({ bookSlug, prev, next, currentChapter, totalChapters }: Props) {
  const progressPercent = totalChapters > 0 ? (currentChapter / totalChapters) * 100 : 0

  return (
    <footer className="reader-footer">
      {/* Progress bar at top of footer */}
      <div className="reader-footer__progress">
        <div
          className="reader-footer__progress-bar"
          style={{ width: `${progressPercent}%` }}
          role="progressbar"
          aria-valuenow={currentChapter}
          aria-valuemin={1}
          aria-valuemax={totalChapters}
        />
      </div>

      <div className="reader-footer__nav">
        {prev ? (
          <LocalizedLink to={`/books/${bookSlug}/${prev.slug}`} className="reader-footer__link reader-footer__link--prev">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span>{prev.title}</span>
          </LocalizedLink>
        ) : (
          <div />
        )}

        {/* Chapter indicator */}
        <div className="reader-footer__chapter-info">
          <span className="reader-footer__chapter-current">{currentChapter}</span>
          <span className="reader-footer__chapter-separator">/</span>
          <span className="reader-footer__chapter-total">{totalChapters}</span>
        </div>

        {next ? (
          <LocalizedLink to={`/books/${bookSlug}/${next.slug}`} className="reader-footer__link reader-footer__link--next">
            <span>{next.title}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </LocalizedLink>
        ) : (
          <div />
        )}
      </div>
    </footer>
  )
}
