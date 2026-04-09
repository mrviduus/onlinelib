import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTranslation } from '../../hooks/useTranslation'
import { getLibrary, getAllProgress, type LibraryItem, type ReadingProgressDto } from '../../api/auth'
import { getUserBooks, getUserBookCoverUrl, type UserBook } from '../../api/userBooks'
import { getStorageUrl } from '../../api/client'
import { LocalizedLink } from '../LocalizedLink'

type ContinueBook =
  | { type: 'edition'; item: LibraryItem; progress: ReadingProgressDto }
  | { type: 'userbook'; book: UserBook }

export function ContinueReadingSection() {
  const { isAuthenticated } = useAuth()
  const { t } = useTranslation()
  const [book, setBook] = useState<ContinueBook | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    Promise.all([getLibrary(), getAllProgress(), getUserBooks()])
      .then(([library, allProgress, userBooksResult]) => {
        const progressMap = new Map<string, ReadingProgressDto>()
        for (const p of allProgress.items) progressMap.set(p.editionId, p)

        let best: ContinueBook | null = null
        let bestUpdatedAt = ''

        // Check library editions
        for (const item of library.items) {
          const p = progressMap.get(item.editionId)
          if (!p || p.percent == null || p.percent >= 1) continue
          if (!best || p.updatedAt > bestUpdatedAt) {
            best = { type: 'edition', item, progress: p }
            bestUpdatedAt = p.updatedAt
          }
        }

        // Check user-uploaded books
        for (const ub of userBooksResult) {
          if (ub.status !== 'Ready' || !ub.progressPercent || ub.progressPercent >= 1) continue
          if (!ub.progressUpdatedAt) continue
          if (!best || ub.progressUpdatedAt > bestUpdatedAt) {
            best = { type: 'userbook', book: ub }
            bestUpdatedAt = ub.progressUpdatedAt
          }
        }

        setBook(best)
      })
      .catch(() => {})
  }, [isAuthenticated])

  if (!book) return null

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
    <section className="continue-reading">
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
    </section>
  )
}
