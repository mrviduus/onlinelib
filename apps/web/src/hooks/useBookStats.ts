import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getBookStats, type BookStatsResponse } from '../api/readingTracking'

export function useBookStats() {
  const { isAuthenticated } = useAuth()
  const [bookStats, setBookStats] = useState<BookStatsResponse | null>(null)
  const [year, setYear] = useState<number | undefined>(undefined) // undefined = all-time
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return }
    setLoading(true)
    getBookStats(year)
      .then(setBookStats)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isAuthenticated, year])

  return { bookStats, loading, year, setYear }
}
