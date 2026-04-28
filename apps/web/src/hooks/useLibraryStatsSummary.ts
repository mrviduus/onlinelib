import { useEffect, useState } from 'react'
import { getLibrarySummary, type LibrarySummaryDto } from '../api/readingTracking'
import { useAuth } from '../context/AuthContext'

const CACHE_KEY = 'textstack.libraryStatsSummary'
const TTL_MS = 5 * 60 * 1000

interface Cached { value: LibrarySummaryDto; ts: number }

function readCache(): Cached | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Cached
  } catch { return null }
}

function writeCache(value: LibrarySummaryDto) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ value, ts: Date.now() })) } catch { /* ignore */ }
}

export function useLibraryStatsSummary(): { data: LibrarySummaryDto | null; loading: boolean } {
  const { isAuthenticated } = useAuth()
  const [data, setData] = useState<LibrarySummaryDto | null>(() => readCache()?.value ?? null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) { setData(null); return }
    const cached = readCache()
    if (cached && Date.now() - cached.ts < TTL_MS) {
      setData(cached.value)
      return
    }
    let cancelled = false
    setLoading(true)
    const tz = -new Date().getTimezoneOffset()
    getLibrarySummary(tz)
      .then((d) => { if (!cancelled) { setData(d); writeCache(d) } })
      .catch(() => { /* keep stale or null */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isAuthenticated])

  return { data, loading }
}
