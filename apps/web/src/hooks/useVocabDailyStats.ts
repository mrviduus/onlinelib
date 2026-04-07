import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getVocabStats, getVocabDailyStats, type VocabStatsDto, type VocabDailyStatDto } from '../api/vocabulary'

export function useVocabDailyStats() {
  const { isAuthenticated } = useAuth()
  const [vocabStats, setVocabStats] = useState<VocabStatsDto | null>(null)
  const [dailyStats, setDailyStats] = useState<VocabDailyStatDto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return }

    const tz = -new Date().getTimezoneOffset()
    Promise.all([
      getVocabStats(),
      getVocabDailyStats(tz),
    ])
      .then(([stats, daily]) => {
        setVocabStats(stats)
        setDailyStats(daily)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isAuthenticated])

  return { vocabStats, dailyStats, loading }
}
