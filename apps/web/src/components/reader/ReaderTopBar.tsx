import { Link } from 'react-router-dom'

interface Props {
  visible: boolean
  bookSlug: string
  title: string
  chapterTitle: string
  scrollPercent: number
  onTocClick: () => void
  onSettingsClick: () => void
}

export function ReaderTopBar({
  visible,
  bookSlug,
  title,
  chapterTitle,
  scrollPercent,
  onTocClick,
  onSettingsClick,
}: Props) {
  return (
    <header
      className="reader-top-bar"
      style={{
        transform: visible ? 'translateY(0)' : 'translateY(-100%)',
        opacity: visible ? 1 : 0,
      }}
    >
      <div className="reader-top-bar__left">
        <Link to={`/books/${bookSlug}`} className="reader-top-bar__back">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="reader-top-bar__title">
          <span className="reader-top-bar__book-title">{title}</span>
          <span className="reader-top-bar__chapter-title">{chapterTitle}</span>
        </div>
      </div>

      <div className="reader-top-bar__right">
        <span className="reader-top-bar__progress">{Math.round(scrollPercent * 100)}%</span>
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
      </div>
    </header>
  )
}
