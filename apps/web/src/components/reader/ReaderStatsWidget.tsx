import { useState, useEffect } from 'react'
import type { QuickStats } from '../../hooks/useQuickStats'
import { StreakBadge } from '../StreakBadge'

interface Props {
  sessionStartedAt: number | null
  quickStats: QuickStats | null
  bookEtf?: string | null
}

export function ReaderStatsWidget({ sessionStartedAt, quickStats, bookEtf }: Props) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!sessionStartedAt) { setElapsed(0); return }

    setElapsed(Math.floor((Date.now() - sessionStartedAt) / 60000))
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - sessionStartedAt) / 60000))
    }, 60000)
    return () => clearInterval(id)
  }, [sessionStartedAt])

  const goal = quickStats?.dailyGoal
  const todayMin = Math.round((quickStats?.todaySeconds || 0) / 60) + elapsed
  const goalTarget = goal?.target || 0
  const goalPct = goalTarget > 0 ? Math.min(1, todayMin / goalTarget) : 0

  if (elapsed === 0 && goalTarget === 0 && !bookEtf) return null

  return (
    <div className="reader-stats-widget">
      {elapsed > 0 && <span className="reader-stats-widget__item">{elapsed}m</span>}
      {goalTarget > 0 && (
        <span className="reader-stats-widget__item">
          <StreakBadge streak={quickStats?.currentStreak || 0} progress={goalPct} size={24} />
          <span className="reader-stats-widget__goal-text">{todayMin}/{goalTarget}m</span>
        </span>
      )}
      {bookEtf && <span className="reader-stats-widget__item reader-stats-widget__etf">{bookEtf}</span>}
    </div>
  )
}
