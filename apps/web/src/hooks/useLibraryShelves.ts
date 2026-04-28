import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getLibraryShelves, type LibraryShelves } from '../api/library'

const CACHE_TTL_MS = 60_000

let cache: { value: LibraryShelves; at: number } | null = null

export interface UseLibraryShelves {
  shelves: LibraryShelves | null
  loading: boolean
  error: string | null
}

export function useLibraryShelves(): UseLibraryShelves {
  const { isAuthenticated } = useAuth()
  const [shelves, setShelves] = useState<LibraryShelves | null>(
    cache && Date.now() - cache.at < CACHE_TTL_MS ? cache.value : null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      setShelves(null)
      return
    }
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      setShelves(cache.value)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getLibraryShelves()
      .then((value) => {
        if (cancelled) return
        cache = { value, at: Date.now() }
        setShelves(value)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.message ?? 'Failed to load shelves')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [isAuthenticated])

  return { shelves, loading, error }
}

export function clearLibraryShelvesCache(): void {
  cache = null
}
