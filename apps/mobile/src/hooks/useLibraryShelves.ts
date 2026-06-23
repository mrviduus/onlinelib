import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { libraryApi } from '@textstack/shared'
import type { LibraryShelves } from '@textstack/shared'
import { useAuth } from '../context/AuthContext'

const CACHE_TTL_MS = 60_000

let cache: { value: LibraryShelves; at: number } | null = null

// Module-level pub/sub. clearLibraryShelvesCache() bumps the version and
// notifies every mounted useLibraryShelves so the live carousel re-fetches
// immediately — not just on the next focus. This is the root-cause fix for
// the headline bug: a mutation (remove-from-library / delete-upload) happens
// ON the focused Library tab, so there is no focus transition to trigger the
// useFocusEffect refetch (FIX 2).
let invalidateVersion = 0
const subscribers = new Set<() => void>()

function notifySubscribers() {
  subscribers.forEach((fn) => fn())
}

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
  // Tracks the in-flight request so a fresh fetch (e.g. cache-invalidation)
  // supersedes a slower one and we never set state on a stale resolution.
  const fetchGenRef = useRef(0)

  const fetchShelves = useCallback(() => {
    if (!isAuthenticated) {
      setShelves(null)
      return
    }
    const myGen = ++fetchGenRef.current
    setLoading(true)
    setError(null)
    libraryApi.getLibraryShelves()
      .then((value) => {
        if (myGen !== fetchGenRef.current) return
        cache = { value, at: Date.now() }
        setShelves(value)
      })
      .catch((e) => {
        if (myGen !== fetchGenRef.current) return
        setError(e?.message ?? 'Failed to load shelves')
      })
      .finally(() => {
        if (myGen === fetchGenRef.current) setLoading(false)
      })
  }, [isAuthenticated])

  // Focus: serve the TTL cache if warm, else fetch. Keeps the 60s perf cache
  // for normal tab navigation.
  useFocusEffect(useCallback(() => {
    if (!isAuthenticated) {
      setShelves(null)
      return
    }
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      setShelves(cache.value)
      return
    }
    fetchShelves()
  }, [isAuthenticated, fetchShelves]))

  // Subscribe to cache invalidations so a clear() forces an immediate refetch
  // in the live (focused) component without waiting for a focus transition.
  useEffect(() => {
    let lastVersion = invalidateVersion
    const onInvalidate = () => {
      // Guard against redundant fires; only react when the version advanced.
      if (invalidateVersion === lastVersion) return
      lastVersion = invalidateVersion
      fetchShelves()
    }
    subscribers.add(onInvalidate)
    return () => { subscribers.delete(onInvalidate) }
  }, [fetchShelves])

  return { shelves, loading, error }
}

export function clearLibraryShelvesCache(): void {
  cache = null
  invalidateVersion++
  notifySubscribers()
}
