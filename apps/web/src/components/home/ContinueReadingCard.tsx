import { useTranslation } from '../../hooks/useTranslation'
import { getUserBookCoverUrl } from '../../api/userBooks'
import { getStorageUrl } from '../../api/client'
import { LocalizedLink } from '../LocalizedLink'
import type { ContinueBook } from '../../hooks/useContinueReading'

interface ContinueReadingCardProps {
  book: ContinueBook
}

export function ContinueReadingCard({ book }: ContinueReadingCardProps) {
  const { t } = useTranslation()

  const percent = book.type === 'edition'
    ? Math.round((book.progress.percent ?? 0) * 100)
    : Math.round((book.book.progressPercent ?? 0) * 100)

  const coverUrl = book.type === 'edition'
    ? getStorageUrl(book.item.coverPath)
    : getUserBookCoverUrl(book.book.coverPath)

  const readerPath = book.type === 'edition'
    ? `/books/${book.item.slug}/${book.progress.chapterSlug}`
    : `/library/my/${book.book.id}/read/${book.book.progressChapterSlug}`

  const title = book.type === 'edition' ? book.item.title : book.book.title

  return (
    <LocalizedLink to={readerPath} className="continue-reading__card">
      {coverUrl ? (
        <img src={coverUrl} alt="" className="continue-reading__cover" loading="lazy" />
      ) : (
        <div className="continue-reading__cover-placeholder">📖</div>
      )}
      <div className="continue-reading__info">
        <span className="continue-reading__label">{t('home.continueReading.label')}</span>
        <span className="continue-reading__title">{title}</span>
        <div className="continue-reading__progress-row">
          <div className="continue-reading__progress-bar">
            <div className="continue-reading__progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <span className="continue-reading__percent">{percent}%</span>
        </div>
      </div>
      <span className="continue-reading__btn">▶</span>
    </LocalizedLink>
  )
}
