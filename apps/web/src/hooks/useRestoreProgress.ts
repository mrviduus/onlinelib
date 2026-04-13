import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { getProgress } from '../api/auth'

const STORAGE_KEY = 'reading.progress.'

interface LocalProgress {
  chapterId: string
  chapterSlug: string
  locator: string
  percent: number
  /** Epoch ms. Optional for backward-compat with pre-fix entries (treated as 0 → server wins). */
  updatedAt?: number
}

interface SavedProgress {
  chapterSlug: string | null
  locator: string
  percent?: number
  /** Epoch ms. 0 when unknown. */
  updatedAt: number
}

interface RestoreState {
  savedProgress: SavedProgress | null
  isLoading: boolean
  shouldNavigate: boolean
  targetChapterSlug: string | null
}

export function useRestoreProgress(
  editionId: string | undefined,
  currentChapterSlug: string | undefined
): RestoreState {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [state, setState] = useState<RestoreState>({
    savedProgress: null,
    isLoading: true,
    shouldNavigate: false,
    targetChapterSlug: null,
  })
  // Composite-key dedupe: re-fetch when editionId OR isAuthenticated changes.
  // Covers the "user logs in mid-reading" case — without this, post-login server data
  // never reaches savedProgress until a reload.
  const lastFetchKeyRef = useRef<string | null>(null)
  // Tracks whether we've already done the initial resume for this editionId. Subsequent
  // fetches (after login) update savedProgress but must NOT trigger navigation — mid-session
  // jumps to another chapter are disruptive UX.
  const seenEditionIdRef = useRef<string | null>(null)

  // Reset shouldNavigate once navigation completes (currentChapterSlug matches target)
  useEffect(() => {
    if (state.shouldNavigate && state.targetChapterSlug === currentChapterSlug) {
      setState(s => ({ ...s, shouldNavigate: false, targetChapterSlug: null }))
    }
  }, [currentChapterSlug, state.shouldNavigate, state.targetChapterSlug])

  useEffect(() => {
    // Wait for auth check and editionId
    if (authLoading || !editionId) return
    // Skip if we've already fetched for this (editionId, auth) combo
    const fetchKey = `${editionId}:${isAuthenticated}`
    if (lastFetchKeyRef.current === fetchKey) return
    lastFetchKeyRef.current = fetchKey

    const isInitialFetch = seenEditionIdRef.current !== editionId
    seenEditionIdRef.current = editionId

    async function fetchProgress() {
      // Skip restore when navigating directly from TOC (?direct=1)
      const params = new URLSearchParams(window.location.search)
      if (params.get('direct') === '1') {
        setState(s => ({ ...s, isLoading: false }))
        return
      }

      let progress: SavedProgress | null = null

      // Always check localStorage first (works offline, always available)
      try {
        const stored = localStorage.getItem(`${STORAGE_KEY}${editionId}`)
        if (stored) {
          const local = JSON.parse(stored) as LocalProgress
          progress = {
            chapterSlug: local.chapterSlug,
            locator: local.locator,
            percent: local.percent,
            updatedAt: local.updatedAt ?? 0,
          }
        }
      } catch {
        // localStorage might be unavailable
      }

      // If authenticated, check server (may have newer data from another device).
      // LWW: newer timestamp wins. Percent-based merge was broken — a stale server record
      // at 95% of ch1 beat a fresh local record at 20% of ch5, tossing the user back.
      if (isAuthenticated) {
        try {
          const serverProgress = await getProgress(editionId!)
          if (serverProgress) {
            const serverData: SavedProgress = {
              chapterSlug: serverProgress.chapterSlug,
              locator: serverProgress.locator,
              percent: serverProgress.percent ?? undefined,
              updatedAt: serverProgress.updatedAt
                ? Date.parse(serverProgress.updatedAt)
                : 0,
            }
            if (!progress || serverData.updatedAt > progress.updatedAt) {
              progress = serverData
            }
          }
        } catch {
          // Server error, use localStorage
        }
      }

      if (progress && progress.chapterSlug) {
        // Only navigate on the initial resume — after that, a post-login refetch just
        // updates savedProgress for bookmarks/UI without jumping the user away.
        const shouldNav = isInitialFetch && progress.chapterSlug !== currentChapterSlug
        setState({
          savedProgress: progress,
          isLoading: false,
          shouldNavigate: shouldNav,
          targetChapterSlug: shouldNav ? progress.chapterSlug : null,
        })
      } else {
        setState(s => ({ ...s, savedProgress: progress, isLoading: false }))
      }
    }

    fetchProgress()
  }, [editionId, currentChapterSlug, isAuthenticated, authLoading])

  return state
}
