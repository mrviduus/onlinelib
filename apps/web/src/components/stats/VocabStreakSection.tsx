import { useState } from 'react'
import type { VocabStatsDto, VocabDailyStatDto } from '../../api/vocabulary'

interface Props {
  vocabStats: VocabStatsDto
  dailyStats: VocabDailyStatDto[]
}

const DAILY_GOAL = 10 // reviews per day to maintain streak

function FlameIcon({ active, size = 16 }: { active: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ opacity: active ? 1 : 0.25 }}>
      <path
        d="M12 2C12 2 9.5 6.5 9.5 9.5C9.5 11 10 12 10 12C10 12 8 10.5 7.5 8C5.5 10 5 12.5 5 14C5 18.4 8.6 22 13 22C17.4 22 20 18.4 20 14C20 8 12 2 12 2Z"
        fill={active ? '#fff' : '#fff'}
      />
      {active && (
        <path
          d="M12.5 22C10 22 9 19.5 9 17.5C9 15.5 11 13 12.5 11.5C14 13 16 15.5 16 17.5C16 19.5 15 22 12.5 22Z"
          fill="rgba(255,255,255,0.6)"
        />
      )}
    </svg>
  )
}

function getLast7Days(dailyStats: VocabDailyStatDto[]): VocabDailyStatDto[] {
  const today = new Date()
  const result: VocabDailyStatDto[] = []
  const statsMap = new Map(dailyStats.map(d => [d.date.split('T')[0], d]))

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    result.push(statsMap.get(key) || { date: key, wordsAdded: 0, reviewCount: 0, correctCount: 0, practiceCount: 0, srsCount: 0 })
  }
  return result
}

function WeeklyVocabChart({ dailyStats }: { dailyStats: VocabDailyStatDto[] }) {
  const last7 = getLast7Days(dailyStats)
  const maxVal = Math.max(...last7.map(d => d.wordsAdded + d.reviewCount), DAILY_GOAL, 1)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="vocab-streak__chart-wrapper">
      <div className="vocab-streak__legend">
        <span className="vocab-streak__legend-item">
          <span className="vocab-streak__legend-dot vocab-streak__legend-dot--added" /> Words Added
        </span>
        <span className="vocab-streak__legend-item">
          <span className="vocab-streak__legend-dot vocab-streak__legend-dot--reviewed" /> Words Reviewed
        </span>
        <span className="vocab-streak__legend-item">
          <span className="vocab-streak__legend-dot vocab-streak__legend-dot--goal" /> Daily Goal
        </span>
      </div>
      <div className="vocab-streak__chart">
        {/* Goal line */}
        <div
          className="vocab-streak__goal-line"
          style={{ bottom: `${(DAILY_GOAL / maxVal) * 100}%` }}
        />
        {last7.map((day, i) => {
          const addedH = (day.wordsAdded / maxVal) * 100
          const reviewedH = (day.reviewCount / maxVal) * 100
          const date = new Date(day.date)
          const active = day.reviewCount > 0 || day.wordsAdded > 0
          return (
            <div key={i} className="vocab-streak__bar-col">
              <div className="vocab-streak__bar-wrapper">
                <div className="vocab-streak__bar vocab-streak__bar--reviewed" style={{ height: `${Math.max(reviewedH, reviewedH > 0 ? 4 : 0)}%` }}
                  title={`${day.reviewCount} reviewed`}
                />
                <div className="vocab-streak__bar vocab-streak__bar--added" style={{ height: `${Math.max(addedH, addedH > 0 ? 4 : 0)}%` }}
                  title={`${day.wordsAdded} added`}
                />
              </div>
              <span className="vocab-streak__day-label">{days[date.getDay()]}</span>
              <FlameIcon active={active} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

type HeatmapMode = 'combined' | 'added' | 'reviewed'

function YearlyHeatmap({ dailyStats }: { dailyStats: VocabDailyStatDto[] }) {
  const [mode, setMode] = useState<HeatmapMode>('combined')
  const statsMap = new Map(dailyStats.map(d => [d.date.split('T')[0], d]))

  const today = new Date()
  const cells: { date: string; value: number }[] = []
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    const stat = statsMap.get(key)
    let value = 0
    if (stat) {
      if (mode === 'added') value = stat.wordsAdded
      else if (mode === 'reviewed') value = stat.reviewCount
      else value = stat.wordsAdded + stat.reviewCount
    }
    cells.push({ date: key, value })
  }

  const maxVal = Math.max(...cells.map(c => c.value), 1)

  const getColor = (value: number): string => {
    if (value === 0) return 'var(--color-bg-secondary, #f3f4f6)'
    const ratio = value / maxVal
    if (ratio < 0.25) return '#d4a574'
    if (ratio < 0.5) return '#c4884e'
    if (ratio < 0.75) return 'var(--color-brand, #C4704B)'
    return '#8b4513'
  }

  const totalAdded = dailyStats.reduce((s, d) => s + d.wordsAdded, 0)
  const totalReviewed = dailyStats.reduce((s, d) => s + d.reviewCount, 0)

  return (
    <section className="vocab-heatmap">
      <h3>Long Term Progress</h3>
      <div className="vocab-heatmap__tabs">
        {(['combined', 'added', 'reviewed'] as const).map(m => (
          <button
            key={m}
            className={`vocab-heatmap__tab${mode === m ? ' vocab-heatmap__tab--active' : ''}`}
            onClick={() => setMode(m)}
          >
            {m === 'combined' ? 'Combined' : m === 'added' ? 'Words Added' : 'Words Reviewed'}
          </button>
        ))}
      </div>
      <div className="vocab-heatmap__year">{today.getFullYear()}</div>
      <div className="vocab-heatmap__grid">
        {cells.map((cell) => (
          <div
            key={cell.date}
            className="vocab-heatmap__cell"
            style={{ backgroundColor: getColor(cell.value) }}
            title={`${cell.date}: ${cell.value}`}
          />
        ))}
      </div>
      <div className="vocab-heatmap__summary">
        {totalAdded} words added · {totalReviewed} words reviewed
      </div>
    </section>
  )
}

export function VocabStreakSection({ vocabStats, dailyStats }: Props) {
  const streak = vocabStats.streak

  return (
    <div className="vocab-streak">
      <div className="vocab-streak__header">
        <h2 className="vocab-streak__title">
          {streak > 0 ? `Keep Up Your ${streak} Day Streak` : 'Start Your Streak!'}
        </h2>
        <p className="vocab-streak__subtitle">
          Review {DAILY_GOAL} flashcards every day to keep your streak going.
        </p>
      </div>

      <WeeklyVocabChart dailyStats={dailyStats} />

      <YearlyHeatmap dailyStats={dailyStats} />
    </div>
  )
}
