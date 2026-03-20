import { useState, useEffect } from 'react'
import { readingTrackingApi } from '@textstack/shared'

interface QuickStats {
  todaySeconds: number
  dailyGoalMinutes: number | null
  currentStreak: number
}

export function useQuickStats(isAuthenticated: boolean) {
  const [stats, setStats] = useState<QuickStats | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    Promise.all([
      readingTrackingApi.getStats(),
      readingTrackingApi.getGoals(),
    ])
      .then(([s, goals]) => {
        const dailyGoal = goals.find(g => g.goalType === 'daily_minutes')
        setStats({
          todaySeconds: s.todaySeconds,
          dailyGoalMinutes: dailyGoal ? dailyGoal.targetValue : null,
          currentStreak: s.currentStreak,
        })
      })
      .catch(() => {})
  }, [isAuthenticated])

  return stats
}
