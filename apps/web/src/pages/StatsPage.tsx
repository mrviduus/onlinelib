import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from '../hooks/useTranslation'
import { useReadingStats } from '../hooks/useReadingStats'
import { useReadingGoals } from '../hooks/useReadingGoals'
import { useAchievements } from '../hooks/useAchievements'
import { useBookStats } from '../hooks/useBookStats'
import { SeoHead } from '../components/SeoHead'
import { Footer } from '../components/Footer'
import { TimePeriodFilter } from '../components/stats/TimePeriodFilter'
import { StatsOverviewTab } from '../components/stats/StatsOverviewTab'
import { StatsBooksTab } from '../components/stats/StatsBooksTab'
import { StatsTimeTab } from '../components/stats/StatsTimeTab'
import { StatsAchievementsTab } from '../components/stats/StatsAchievementsTab'
import { VocabStreakSection } from '../components/stats/VocabStreakSection'
import { useVocabDailyStats } from '../hooks/useVocabDailyStats'

type Tab = 'overview' | 'books' | 'time' | 'achievements'

const TABS: { key: Tab; labelKey: string; fallback: string }[] = [
  { key: 'overview', labelKey: 'stats.overview', fallback: 'Overview' },
  { key: 'books', labelKey: 'stats.books', fallback: 'Books' },
  { key: 'time', labelKey: 'stats.time', fallback: 'Time' },
  { key: 'achievements', labelKey: 'stats.achievements', fallback: 'Achievements' },
]

export function StatsPage() {
  const { isAuthenticated } = useAuth()
  const { t } = useTranslation()
  const { stats, dailyStats, loading } = useReadingStats()
  const { goals, upsert: upsertGoal } = useReadingGoals()
  const { achievements } = useAchievements()
  const { bookStats, loading: bookStatsLoading, year, setYear } = useBookStats()
  const { vocabStats, dailyStats: vocabDailyStats } = useVocabDailyStats()
  const [tab, setTab] = useState<Tab>('overview')

  if (!isAuthenticated) {
    return (
      <div className="page-container">
        <SeoHead title={t('stats.title')} noindex />
        <div className="stats-page">
          <h1>{t('stats.title')}</h1>
          <p>{t('stats.signInPrompt')}</p>
        </div>
        <Footer />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="page-container">
        <SeoHead title={t('stats.title')} noindex />
        <div className="stats-page">
          <h1>{t('stats.title')}</h1>
          <p>{t('common.loading')}</p>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="page-container">
      <SeoHead title={t('stats.title')} noindex />
      <div className="stats-page">
        <h1>{t('stats.title')}</h1>

        {/* Vocab streak dashboard — first section */}
        {vocabStats && vocabStats.totalWords > 0 && (
          <VocabStreakSection vocabStats={vocabStats} dailyStats={vocabDailyStats} />
        )}

        {/* Year filter (for books/time tabs) */}
        {(tab === 'books' || tab === 'time') && (
          <div className="stats-filters">
            <TimePeriodFilter
              year={year}
              setYear={setYear}
              availableYears={bookStats?.availableYears || []}
            />
          </div>
        )}

        {/* Tab bar */}
        <div className="stats-tabs">
          {TABS.map(({ key, labelKey, fallback }) => (
            <button
              key={key}
              className={`stats-tabs__tab ${tab === key ? 'stats-tabs__tab--active' : ''}`}
              onClick={() => setTab(key)}
            >
              {t(labelKey) || fallback}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'overview' && (
          <StatsOverviewTab
            stats={stats}
            dailyStats={dailyStats}
            goals={goals}
            upsertGoal={upsertGoal}
          />
        )}
        {tab === 'books' && (
          <StatsBooksTab bookStats={bookStats} loading={bookStatsLoading} />
        )}
        {tab === 'time' && (
          <StatsTimeTab bookStats={bookStats} stats={stats} loading={bookStatsLoading} />
        )}
        {tab === 'achievements' && (
          <StatsAchievementsTab achievements={achievements} />
        )}
      </div>
      <Footer />
    </div>
  )
}
