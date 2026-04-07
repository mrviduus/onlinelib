import { useState, useEffect } from 'react'
import { readingTrackingApi, vocabularyApi } from '@textstack/shared'

interface QuickStats {
  todaySeconds: number
  dailyGoalMinutes: number | null
  currentStreak: number
  vocabDueNow: number
  vocabReviewedToday: number
  vocabStreak: number
}

export function useQuickStats(isAuthenticated: boolean) {
  const [stats, setStats] = useState<QuickStats | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    Promise.all([
      readingTrackingApi.getStats(),
      readingTrackingApi.getGoals(),
      vocabularyApi.getVocabularyStats().catch(() => null),
    ])
      .then(([s, goals, v]) => {
        const dailyGoal = goals.find(g => g.goalType === 'daily_minutes')
        setStats({
          todaySeconds: s.todaySeconds,
          dailyGoalMinutes: dailyGoal ? dailyGoal.targetValue : null,
          currentStreak: s.currentStreak,
          vocabDueNow: v?.dueNow ?? 0,
          vocabReviewedToday: v?.reviewedToday ?? 0,
          vocabStreak: v?.streak ?? 0,
        })
      })
      .catch(() => {})
  }, [isAuthenticated])

  return stats
}
