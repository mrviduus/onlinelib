import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getStats } from '../api/readingTracking'

const CACHE_KEY = 'reading.quickStats'

export interface QuickStats {
  todaySeconds: number
  todayVocabReviews: number
  dailyGoal: { target: number; today: number; met: boolean } | null
  currentStreak: number
  wpm: number | null
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
    getStats(tz)
      .then((s) => {
        const qs: QuickStats = {
          todaySeconds: s.todaySeconds,
          todayVocabReviews: s.todayVocabReviews,
          dailyGoal: s.dailyGoal,
          currentStreak: s.currentStreak,
          wpm: s.avgWordsPerMinute > 0 ? s.avgWordsPerMinute : null,
        }
        setData(qs)
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(qs)) } catch {}
      })
      .catch(() => {})
  }, [isAuthenticated])

  return data
}
