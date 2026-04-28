import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from '../../hooks/useTranslation'
import { useLanguage } from '../../context/LanguageContext'
import { getUserBookStats, type UserBookStats } from '../../api/userBooks'

interface Props {
  bookId: string
}

function formatMinutes(min: number): string {
  if (min < 1) return '0m'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function BookStatsSection({ bookId }: Props) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const [stats, setStats] = useState<UserBookStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getUserBookStats(bookId)
      .then((s) => { if (!cancelled) setStats(s) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [bookId])

  if (loading) return <section className="book-stats" aria-busy="true">{t('common.loading')}</section>
  if (!stats) return null

  if (stats.sessionsCount === 0) {
    return (
      <section className="book-stats book-stats--empty">
        <div className="book-stats__empty-icon">📖</div>
        <div className="book-stats__empty-text">{t('library.bookStats.empty')}</div>
      </section>
    )
  }

  return (
    <section className="book-stats" aria-label={t('library.bookStats.title')}>
      <h2 className="book-stats__title">{t('library.bookStats.title')}</h2>
      <div className="book-stats__grid">
        <div className="book-stats__tile">
          <div className="book-stats__tile-label">{t('library.bookStats.readingTime')}</div>
          <div className="book-stats__tile-value">{formatMinutes(stats.totalReadMinutes)}</div>
        </div>
        <div className="book-stats__tile">
          <div className="book-stats__tile-label">{t('library.bookStats.sessions')}</div>
          <div className="book-stats__tile-value">{stats.sessionsCount}</div>
        </div>
        <div className="book-stats__tile">
          <div className="book-stats__tile-label">{t('library.bookStats.wordsRead')}</div>
          <div className="book-stats__tile-value">{stats.wordsRead.toLocaleString()}</div>
        </div>
        <Link to={`/${language}/vocabulary?bookId=${bookId}`} className="book-stats__tile book-stats__tile--link">
          <div className="book-stats__tile-label">{t('library.bookStats.vocabSaved')}</div>
          <div className="book-stats__tile-value">{stats.vocabSavedCount}</div>
        </Link>
        <Link to={`/${language}/highlights?bookId=${bookId}`} className="book-stats__tile book-stats__tile--link">
          <div className="book-stats__tile-label">{t('library.bookStats.highlights')}</div>
          <div className="book-stats__tile-value">{stats.highlightsCount}</div>
        </Link>
        {stats.averageWordsPerMinute > 0 && (
          <div className="book-stats__tile">
            <div className="book-stats__tile-label">{t('library.bookStats.pace')}</div>
            <div className="book-stats__tile-value">{stats.averageWordsPerMinute} <span className="book-stats__tile-unit">wpm</span></div>
          </div>
        )}
        {stats.estimatedMinutesRemaining !== null && (
          <div className="book-stats__tile">
            <div className="book-stats__tile-label">{t('library.bookStats.timeLeft')}</div>
            <div className="book-stats__tile-value">{formatMinutes(stats.estimatedMinutesRemaining)}</div>
          </div>
        )}
      </div>
    </section>
  )
}
