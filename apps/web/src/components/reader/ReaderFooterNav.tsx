import { LocalizedLink } from '../LocalizedLink'
import type { ChapterNav } from '../../types/api'

interface Props {
  bookSlug: string
  prev: ChapterNav | null
  next: ChapterNav | null
}

export function ReaderFooterNav({ bookSlug, prev, next }: Props) {
  return (
    <footer className="reader-footer">
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
    </footer>
  )
}
