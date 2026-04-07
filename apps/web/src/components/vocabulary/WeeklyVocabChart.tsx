import type { VocabDailyStatDto } from '../../api/vocabulary'

const DAILY_GOAL = 10

function FlameIcon({ active, size = 16 }: { active: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ opacity: active ? 1 : 0.25 }}>
      <path
        d="M12 2C12 2 9.5 6.5 9.5 9.5C9.5 11 10 12 10 12C10 12 8 10.5 7.5 8C5.5 10 5 12.5 5 14C5 18.4 8.6 22 13 22C17.4 22 20 18.4 20 14C20 8 12 2 12 2Z"
        fill="currentColor"
      />
      {active && (
        <path
          d="M12.5 22C10 22 9 19.5 9 17.5C9 15.5 11 13 12.5 11.5C14 13 16 15.5 16 17.5C16 19.5 15 22 12.5 22Z"
          fill="currentColor" fillOpacity={0.6}
        />
      )}
    </svg>
  )
}

export function getLast7Days(dailyStats: VocabDailyStatDto[]): VocabDailyStatDto[] {
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

export function WeeklyVocabChart({ dailyStats }: { dailyStats: VocabDailyStatDto[] }) {
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
