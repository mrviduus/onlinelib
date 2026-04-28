import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from '../../hooks/useTranslation'
import { useLanguage } from '../../context/LanguageContext'
import { useLibraryStatsSummary } from '../../hooks/useLibraryStatsSummary'

const COLLAPSED_KEY = 'textstack.libraryStatsHeader.collapsed'

export function LibraryStatsHeader() {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const { data, loading } = useLibraryStatsSummary()
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(COLLAPSED_KEY) === '1')

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  if (loading && !data) return null
  if (!data) return null

  const statsHref = `/${language}/stats`
  const goalCurrent = data.goal?.current ?? 0
  const goalTarget = data.goal?.target ?? 0
  const goalPercent = goalTarget > 0 ? Math.min(100, Math.round((goalCurrent / goalTarget) * 100)) : 0

  if (collapsed) {
    return (
      <div className="library-stats-header library-stats-header--collapsed">
        <button type="button" className="library-stats-header__toggle" onClick={toggle} aria-label={t('library.statsHeader.expand')}>
          <span>📊 {t('library.statsHeader.title')}</span>
          <span aria-hidden="true">▾</span>
        </button>
      </div>
    )
  }

  return (
    <div className="library-stats-header" role="region" aria-label={t('library.statsHeader.title')}>
      <Link to={statsHref} className="library-stats-header__tile">
        <div className="library-stats-header__tile-label">{t('library.statsHeader.pagesThisMonth')}</div>
        <div className="library-stats-header__tile-value">
          {data.pagesThisMonth > 0 ? data.pagesThisMonth.toLocaleString() : <span className="library-stats-header__tile-empty">{t('library.statsHeader.empty.pages')}</span>}
        </div>
      </Link>

      <Link to={statsHref} className="library-stats-header__tile">
        <div className="library-stats-header__tile-label">{t('library.statsHeader.streak')}</div>
        <div className="library-stats-header__tile-value">
          {data.currentStreak > 0
            ? <>🔥 {t('library.statsHeader.daysCount', { n: data.currentStreak })}</>
            : <span className="library-stats-header__tile-empty">{t('library.statsHeader.empty.streak')}</span>}
        </div>
      </Link>

      {data.goal ? (
        <Link to={statsHref} className="library-stats-header__tile">
          <div className="library-stats-header__tile-label">
            {data.goal.type === 'daily_minutes' ? t('library.statsHeader.dailyGoal') : t('library.statsHeader.yearlyGoal')}
          </div>
          <div className="library-stats-header__tile-value">
            {goalCurrent}/{goalTarget} {data.goal.type === 'daily_minutes' ? t('library.statsHeader.minSuffix') : t('library.statsHeader.booksSuffix')}
          </div>
          <div className="library-stats-header__progress" aria-hidden="true">
            <div className="library-stats-header__progress-fill" style={{ width: `${goalPercent}%` }} />
          </div>
        </Link>
      ) : (
        <Link to={statsHref} className="library-stats-header__tile library-stats-header__tile--cta">
          <div className="library-stats-header__tile-label">{t('library.statsHeader.goal')}</div>
          <div className="library-stats-header__tile-value library-stats-header__tile-cta">
            {t('library.statsHeader.empty.goal')}
          </div>
        </Link>
      )}

      <Link to={statsHref} className="library-stats-header__tile">
        <div className="library-stats-header__tile-label">{t('library.statsHeader.booksYtd')}</div>
        <div className="library-stats-header__tile-value">
          {data.booksFinishedYtd > 0
            ? data.booksFinishedYtd
            : <span className="library-stats-header__tile-empty">{t('library.statsHeader.empty.books')}</span>}
        </div>
      </Link>

      <button type="button" className="library-stats-header__collapse" onClick={toggle} aria-label={t('library.statsHeader.collapse')}>×</button>
    </div>
  )
}
