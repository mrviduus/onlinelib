import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getStats } from '../api/readingTracking'
import { getVocabStats } from '../api/vocabulary'

const CACHE_KEY = 'reading.quickStats'

export interface QuickStats {
  todaySeconds: number
  todayVocabReviews: number
  dailyGoal: { target: number; today: number; met: boolean } | null
  currentStreak: number
  wpm: number | null
  vocabDueNow: number
  vocabReviewedToday: number
  vocabStreak: number
}

function getCached(): QuickStats | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

export function useQuickStats(): QuickStats | null {
  const { isAuthenticated } = useAuth()
  const [data, setData] = useState<QuickStats | null>(getCached)

  useEffect(() => {
    if (!isAuthenticated) return

    const tz = -new Date().getTimezoneOffset()
    Promise.all([
      getStats(tz),
      getVocabStats().catch(() => null),
    ]).then(([s, v]) => {
        const qs: QuickStats = {
          todaySeconds: s.todaySeconds,
          todayVocabReviews: s.todayVocabReviews,
          dailyGoal: s.dailyGoal,
          currentStreak: s.currentStreak,
          wpm: s.avgWordsPerMinute > 0 ? s.avgWordsPerMinute : null,
          vocabDueNow: v?.dueNow ?? 0,
          vocabReviewedToday: v?.reviewedToday ?? 0,
          vocabStreak: v?.streak ?? 0,
        }
        setData(qs)
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(qs)) } catch {}
      })
      .catch(() => {})
  }, [isAuthenticated])

  return data
}
