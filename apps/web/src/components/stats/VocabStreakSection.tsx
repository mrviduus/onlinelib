import { useState } from 'react'
import type { VocabStatsDto, VocabDailyStatDto } from '../../api/vocabulary'
import { WeeklyVocabChart } from '../vocabulary/WeeklyVocabChart'
import { plural } from '@textstack/shared'

interface Props {
  vocabStats: VocabStatsDto
  dailyStats: VocabDailyStatDto[]
}

const DAILY_GOAL = 10

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
    if (value === 0) return 'var(--heatmap-empty)'
    const ratio = value / maxVal
    if (ratio < 0.25) return 'var(--heatmap-l1)'
    if (ratio < 0.5) return 'var(--heatmap-l2)'
    if (ratio < 0.75) return 'var(--heatmap-l3)'
    return 'var(--heatmap-l4)'
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
        {plural(totalAdded, 'word', 'words', '{n} {noun} added')} · {plural(totalReviewed, 'word', 'words', '{n} {noun} reviewed')}
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
