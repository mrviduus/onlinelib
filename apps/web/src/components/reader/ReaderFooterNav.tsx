import { useState } from 'react'

interface Props {
  chapterTitle: string
  overallProgress: number
  bookEtf?: string | null
  chapterEtf?: string | null
}

export function ReaderFooterNav({
  chapterTitle,
  overallProgress,
  bookEtf,
  chapterEtf,
}: Props) {
  const bookPercent = Math.round(overallProgress * 100)
  const [showChapterEtf, setShowChapterEtf] = useState(false)
  const hasEtf = bookEtf || chapterEtf
  const displayEtf = showChapterEtf && chapterEtf ? chapterEtf : bookEtf

  return (
    <footer className="reader-footer">
      <div className="reader-footer__progress">
        <div
          className="reader-footer__progress-bar"
          style={{ width: `${bookPercent}%` }}
          role="progressbar"
          aria-valuenow={bookPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Reading progress"
        />
      </div>

      <div className="reader-footer__info">
        <span className="reader-footer__chapter">{chapterTitle}</span>
        <span
          className="reader-footer__pages"
          onClick={hasEtf ? () => setShowChapterEtf(!showChapterEtf) : undefined}
          style={hasEtf ? { cursor: 'pointer' } : undefined}
        >
          {bookPercent}%{displayEtf && <span className="reader-footer__etf"> · {displayEtf}</span>}
        </span>
      </div>
    </footer>
  )
}
