import type { BookStatsResponse, ReadingStats } from '../../api/readingTracking'
import { useTranslation } from '../../hooks/useTranslation'
import { formatTime } from '../../lib/formatTime'
import { MoodChart } from './MoodChart'
import { PaceChart } from './PaceChart'
import { ReadingTimeByGenreChart } from './ReadingTimeByGenreChart'
import { ReadingTimeByAuthorChart } from './ReadingTimeByAuthorChart'

interface Props {
  bookStats: BookStatsResponse | null
  stats: ReadingStats | null
  loading: boolean
}

export function StatsTimeTab({ bookStats, stats, loading }: Props) {
  const { t } = useTranslation()

  if (loading || !bookStats) return <p>{t('common.loading')}</p>

  return (
    <>
      {/* Summary */}
      <section className="stats-section">
        <div className="stats-cards">
          <div className="stats-card">
            <div className="stats-card__value">{formatTime(stats?.totalSeconds || 0)}</div>
            <div className="stats-card__label">{t('stats.totalTime')}</div>
          </div>
          <div className="stats-card">
            <div className="stats-card__value">{stats?.avgWordsPerMinute || 0}</div>
            <div className="stats-card__label">{t('stats.avgWpm')}</div>
          </div>
          <div className="stats-card">
            <div className="stats-card__value">{formatTime(stats?.weekSeconds || 0)}</div>
            <div className="stats-card__label">{t('stats.thisWeek')}</div>
          </div>
          <div className="stats-card">
            <div className="stats-card__value">{formatTime(stats?.monthSeconds || 0)}</div>
            <div className="stats-card__label">{t('stats.thisMonth')}</div>
          </div>
        </div>
      </section>

      {/* Charts */}
      <div className="stats-card-group">
        <MoodChart data={bookStats.moodStats} />
        <hr className="stats-chart-divider" />
        <PaceChart data={bookStats.paceStats} />
        <hr className="stats-chart-divider" />
        <ReadingTimeByGenreChart data={bookStats.readingTimeByGenre} />
        <hr className="stats-chart-divider" />
        <ReadingTimeByAuthorChart data={bookStats.readingTimeByAuthor} />
      </div>
    </>
  )
}
