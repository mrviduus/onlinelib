import type { ReadingStats, DailyStatDto, GoalDto, CreateGoalRequest } from '../../api/readingTracking'
import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { formatTime } from '../../lib/formatTime'

interface Props {
  stats: ReadingStats | null
  dailyStats: DailyStatDto[]
  goals: GoalDto[]
  upsertGoal: (data: CreateGoalRequest) => Promise<unknown>
}

function GoalRing({ current, target }: { current: number; target: number }) {
  const pct = Math.min(1, current / Math.max(target, 1))
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct)

  return (
    <svg width="100" height="100" viewBox="0 0 100 100" className="stats-goal-ring">
      <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--color-border)" strokeWidth="8" />
      <circle
        cx="50" cy="50" r={radius} fill="none"
        stroke={pct >= 1 ? 'var(--color-success, #22c55e)' : 'var(--color-primary)'}
        strokeWidth="8" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central"
        fontSize="16" fontWeight="600" fill="var(--color-text)">
        {Math.round(pct * 100)}%
      </text>
    </svg>
  )
}

function WeeklyChart({ dailyStats }: { dailyStats: DailyStatDto[] }) {
  const last7 = getLast7Days(dailyStats)
  const maxSeconds = Math.max(...last7.map(d => d.totalSeconds), 1)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="stats-weekly-chart">
      {last7.map((day, i) => {
        const height = Math.max(4, (day.totalSeconds / maxSeconds) * 100)
        const date = new Date(day.date)
        return (
          <div key={i} className="stats-weekly-chart__bar-container">
            <div className="stats-weekly-chart__bar-wrapper">
              <div
                className="stats-weekly-chart__bar"
                style={{ height: `${height}%` }}
                title={`${formatTime(day.totalSeconds)}`}
              />
            </div>
            <span className="stats-weekly-chart__label">{days[date.getDay()]}</span>
          </div>
        )
      })}
    </div>
  )
}

function StreakCalendar({ dailyStats }: { dailyStats: DailyStatDto[] }) {
  const statsMap = new Map(dailyStats.map(d => [d.date.split('T')[0], d.totalSeconds]))
  const today = new Date()
  const cells: { date: string; seconds: number }[] = []

  for (let i = 89; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    cells.push({ date: key, seconds: statsMap.get(key) || 0 })
  }

  const getColor = (seconds: number): string => {
    if (seconds === 0) return 'var(--color-bg-secondary, #f3f4f6)'
    if (seconds < 600) return '#d4a574'
    if (seconds < 1800) return 'var(--color-brand, #C4704B)'
    return '#8b4513'
  }

  return (
    <div className="stats-streak-calendar">
      {cells.map((cell) => (
        <div
          key={cell.date}
          className="stats-streak-calendar__cell"
          style={{ backgroundColor: getColor(cell.seconds) }}
          title={`${cell.date}: ${formatTime(cell.seconds)}`}
        />
      ))}
    </div>
  )
}

function getLast7Days(dailyStats: DailyStatDto[]): DailyStatDto[] {
  const today = new Date()
  const result: DailyStatDto[] = []
  const statsMap = new Map(dailyStats.map(d => [d.date.split('T')[0], d]))

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    result.push(statsMap.get(key) || { date: key, totalSeconds: 0, totalWords: 0, sessionCount: 0 })
  }
  return result
}

export function StatsOverviewTab({ stats, dailyStats, goals, upsertGoal }: Props) {
  const { t } = useTranslation()
  const dailyGoal = goals.find(g => g.goalType === 'daily_minutes')
  const [goalInput, setGoalInput] = useState('')
  const [streakInput, setStreakInput] = useState('')

  const todayWords = dailyStats.find(d => {
    const today = new Date().toISOString().split('T')[0]
    return d.date.split('T')[0] === today
  })?.totalWords || 0

  const handleSetGoal = async () => {
    const val = parseInt(goalInput)
    if (!val || val <= 0) return
    const smm = parseInt(streakInput)
    await upsertGoal({
      goalType: 'daily_minutes',
      targetValue: val,
      year: 0,
      streakMinMinutes: smm > 0 ? smm : undefined,
    })
    setGoalInput('')
    setStreakInput('')
  }

  return (
    <>
      {/* Today summary */}
      <section className="stats-today">
        <div className="stats-today__row">
          <span className="stats-today__label">{t('stats.today') || 'Today'}</span>
          <span className="stats-today__value">
            {formatTime(stats?.todaySeconds || 0)}
            {todayWords > 0 && <> · {todayWords.toLocaleString()} {t('stats.words') || 'words'}</>}
            {stats?.dailyGoal && (
              <> · {t('stats.dailyGoal')}: {Math.round((stats.dailyGoal.today / Math.max(stats.dailyGoal.target, 1)) * 100)}%</>
            )}
          </span>
        </div>
        {(stats?.currentStreak || 0) > 0 && (
          <div className="stats-today__streak">
            {stats!.currentStreak} {t('stats.days')} streak
          </div>
        )}
      </section>

      {/* Streaks */}
      <section className="stats-section">
        <h2>{t('stats.streaks')}</h2>
        <div className="stats-streak-row">
          <div className="stats-card">
            <div className="stats-card__value">{stats?.currentStreak || 0}</div>
            <div className="stats-card__label">{t('stats.currentStreak')}</div>
          </div>
          <div className="stats-card">
            <div className="stats-card__value">{stats?.longestStreak || 0}</div>
            <div className="stats-card__label">{t('stats.longestStreak')}</div>
          </div>
        </div>
        <StreakCalendar dailyStats={dailyStats} />
      </section>

      {/* Daily goal ring + settings */}
      <section className="stats-section">
        <h2>{t('stats.dailyGoal')}</h2>
        {stats?.dailyGoal ? (
          <div className="stats-goal-section">
            <GoalRing current={stats.dailyGoal.today} target={stats.dailyGoal.target} />
            <div className="stats-goal-text">
              <p>{Math.round(stats.dailyGoal.today)}m / {stats.dailyGoal.target}m</p>
              {stats.dailyGoal.met && <p className="stats-goal-met">{t('stats.goalMet')}</p>}
            </div>
          </div>
        ) : null}
        <div className="stats-goal-form">
          <div className="stats-goal-form__row">
            <label>{t('stats.dailyMinutesTarget')}</label>
            <input
              type="number"
              value={goalInput || dailyGoal?.targetValue || ''}
              onChange={e => setGoalInput(e.target.value)}
              placeholder="30"
              min="1"
              className="stats-input"
            />
          </div>
          <div className="stats-goal-form__row">
            <label>{t('stats.streakThreshold')}</label>
            <input
              type="number"
              value={streakInput || dailyGoal?.streakMinMinutes || ''}
              onChange={e => setStreakInput(e.target.value)}
              placeholder="5"
              min="1"
              className="stats-input"
            />
          </div>
          <button onClick={handleSetGoal} className="stats-btn">{t('stats.saveGoal')}</button>
        </div>
      </section>

      {/* Weekly chart */}
      <section className="stats-section">
        <h2>{t('stats.weeklyChart')}</h2>
        <WeeklyChart dailyStats={dailyStats} />
      </section>

      {/* Details */}
      <section className="stats-section">
        <h2>{t('stats.details')}</h2>
        <div className="stats-details">
          <div className="stats-detail-row">
            <span>{t('stats.avgWpm')}</span>
            <span>{stats?.avgWordsPerMinute || 0}</span>
          </div>
          <div className="stats-detail-row">
            <span>{t('stats.thisWeek')}</span>
            <span>{formatTime(stats?.weekSeconds || 0)}</span>
          </div>
          <div className="stats-detail-row">
            <span>{t('stats.thisMonth')}</span>
            <span>{formatTime(stats?.monthSeconds || 0)}</span>
          </div>
        </div>
      </section>
    </>
  )
}
