import { Link } from 'react-router-dom'
import { LocalizedLink } from '../LocalizedLink'

interface Props {
  visible: boolean
  title: string
  chapterTitle: string
  progress: number
  isBookmarked: boolean
  backUrl: string
  sourceUrl?: string | null // Send to TextStack clips — link to the original article
  sourceDomain?: string | null // hostname of sourceUrl (sans www), shown as the link label
  useLocalizedLink?: boolean // true for public books (uses LocalizedLink), false for user books (uses Link)
  showAsk?: boolean // catalog editions only — user uploads aren't chunked for RAG
  showSearch?: boolean // hidden in Original-layout PDF (no page-aware search yet)
  onAskClick?: () => void
  onSearchClick: () => void
  onTocClick: () => void
  onSettingsClick: () => void
  onBookmarkClick: () => void
}

export function ReaderTopBar({
  visible,
  title,
  chapterTitle,
  progress,
  isBookmarked,
  backUrl,
  sourceUrl,
  sourceDomain,
  useLocalizedLink = true,
  showAsk = false,
  showSearch = true,
  onAskClick,
  onSearchClick,
  onTocClick,
  onSettingsClick,
  onBookmarkClick,
}: Props) {
  const BackLink = useLocalizedLink ? LocalizedLink : Link

  return (
    <header
      className="reader-top-bar"
      style={{
        transform: visible ? 'translateY(0)' : 'translateY(-100%)',
        opacity: visible ? 1 : 0,
      }}
    >
      <div className="reader-top-bar__left">
        <BackLink to={backUrl} className="reader-top-bar__back">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </BackLink>
        <div className="reader-top-bar__title">
          <span className="reader-top-bar__book-title">{title}</span>
          {sourceUrl && sourceDomain ? (
            // Send to TextStack clip: link to the original article. sourceDomain is
            // derived from an untrusted clipped URL — render as text only.
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="reader-top-bar__source"
              title={sourceUrl}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <path d="M15 3h6v6M10 14L21 3" />
              </svg>
              {sourceDomain}
            </a>
          ) : (
            <span className="reader-top-bar__chapter-title">{chapterTitle}</span>
          )}
        </div>
      </div>

      <div className="reader-top-bar__right">
        <span className="reader-top-bar__progress">{Math.round(progress * 100)}%</span>
        {showSearch && (
          <button onClick={onSearchClick} className="reader-top-bar__btn" title="Search in chapter">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
        )}
        <button onClick={onBookmarkClick} className="reader-top-bar__btn" title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <button onClick={onTocClick} className="reader-top-bar__btn" title="Table of Contents">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        <button onClick={onSettingsClick} className="reader-top-bar__btn" title="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" />
            <circle cx="8" cy="6" r="2" fill="currentColor" />
            <circle cx="16" cy="12" r="2" fill="currentColor" />
            <circle cx="10" cy="18" r="2" fill="currentColor" />
          </svg>
        </button>
        {/* Ask is appended LAST so it doesn't shift the positional indices that
            the reader e2e tests use (search=0, bookmark=1, toc=2, settings=3). */}
        {showAsk && (
          <button onClick={onAskClick} className="reader-top-bar__btn" title="Ask this book">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <path d="M9.5 9.5a2.5 2.5 0 1 1 3 2.45V13" strokeWidth="1.6" />
              <circle cx="12" cy="15.5" r="0.6" fill="currentColor" stroke="none" />
            </svg>
          </button>
        )}
      </div>
    </header>
  )
}
