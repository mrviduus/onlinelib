import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTranslation } from '../../hooks/useTranslation'
import { getLibrary, getAllProgress, type LibraryItem, type ReadingProgressDto } from '../../api/auth'
import { getStorageUrl } from '../../api/client'
import { LocalizedLink } from '../LocalizedLink'

export function ContinueReadingSection() {
  const { isAuthenticated } = useAuth()
  const { t } = useTranslation()
  const [book, setBook] = useState<{ item: LibraryItem; progress: ReadingProgressDto } | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    Promise.all([getLibrary(), getAllProgress()])
      .then(([library, allProgress]) => {
        const progressMap = new Map<string, ReadingProgressDto>()
        for (const p of allProgress.items) progressMap.set(p.editionId, p)

        let best: { item: LibraryItem; progress: ReadingProgressDto } | null = null
        for (const item of library.items) {
          const p = progressMap.get(item.editionId)
          if (!p || p.percent == null || p.percent >= 1) continue
          if (!best || p.updatedAt > best.progress.updatedAt) {
            best = { item, progress: p }
          }
        }
        setBook(best)
      })
      .catch(() => {})
  }, [isAuthenticated])

  if (!book) return null

  const percent = Math.round((book.progress.percent ?? 0) * 100)
  const coverUrl = getStorageUrl(book.item.coverPath)
  const readerPath = `/books/${book.item.slug}/${book.progress.chapterSlug}`

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
          <span className="continue-reading__title">{book.item.title}</span>
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
