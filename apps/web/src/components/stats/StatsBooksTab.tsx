import type { BookStatsResponse } from '../../api/readingTracking'
import { useTranslation } from '../../hooks/useTranslation'
import { GenreChart } from './GenreChart'
import { AuthorChart } from './AuthorChart'
import { LanguageChart } from './LanguageChart'
import { BooksOverTimeChart } from './BooksOverTimeChart'
import { BookLengthChart } from './BookLengthChart'
import { RatingChart } from './RatingChart'

interface Props {
  bookStats: BookStatsResponse | null
  loading: boolean
}

export function StatsBooksTab({ bookStats, loading }: Props) {
  const { t } = useTranslation()

  if (loading || !bookStats) return <p>{t('common.loading')}</p>

  return (
    <>
      {/* Summary cards */}
      <section className="stats-section">
        <div className="stats-cards">
          <div className="stats-card">
            <div className="stats-card__value">{bookStats.booksFinished}</div>
            <div className="stats-card__label">{t('stats.booksFinished')}</div>
          </div>
          <div className="stats-card">
            <div className="stats-card__value">{bookStats.totalPages.toLocaleString()}</div>
            <div className="stats-card__label">{t('stats.totalPages')}</div>
          </div>
          <div className="stats-card">
            <div className="stats-card__value">{bookStats.avgDaysToFinish || 0}</div>
            <div className="stats-card__label">{t('stats.avgTimeToFinish')}</div>
          </div>
        </div>
      </section>

      {/* Charts */}
      <div className="stats-card-group">
        <GenreChart data={bookStats.genreStats} />
        <hr className="stats-chart-divider" />
        <AuthorChart data={bookStats.authorStats} />
        <hr className="stats-chart-divider" />
        <LanguageChart data={bookStats.languageStats} />
        <hr className="stats-chart-divider" />
        <BookLengthChart data={bookStats.bookLengthDistribution} />
      </div>

      <div className="stats-card-group stats-card-group--spaced">
        <BooksOverTimeChart data={bookStats.booksOverTime} />
      </div>

      <div className="stats-card-group stats-card-group--spaced">
        <RatingChart data={bookStats.ratingDistribution} avgRating={bookStats.avgRating} />
      </div>
    </>
  )
}
