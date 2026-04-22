interface Props {
  chapterTitle: string
  overallProgress: number
  currentChapterIndex: number
  totalChapters: number
}

export function ReaderFooterNav({
  chapterTitle,
  overallProgress,
  currentChapterIndex,
  totalChapters,
}: Props) {
  const bookPercent = Math.round(overallProgress * 100)
  const showCounter = totalChapters > 1 && currentChapterIndex >= 0
  const chapterNumber = currentChapterIndex + 1

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
        {showCounter && (
          <span
            className="reader-footer__counter"
            aria-label={`Chapter ${chapterNumber} of ${totalChapters}`}
          >
            {chapterNumber} / {totalChapters}
          </span>
        )}
        <span className="reader-footer__percent">{bookPercent}%</span>
      </div>
    </footer>
  )
}
