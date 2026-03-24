import { useEffect, useRef, useCallback } from 'react'
import { AppState } from 'react-native'
import { readingTrackingApi } from '@textstack/shared'

const HEARTBEAT_MS = 30_000
const MIN_SECONDS = 10

interface SessionConfig {
  editionId: string | null
  userBookId?: string | null
  wordCount: number
  isAuthenticated: boolean
}

/**
 * Tracks reading session duration. Submits to API on end.
 * Session starts on mount, ends on unmount or app background.
 */
export function useReadingSession(config: SessionConfig) {
  const startTimeRef = useRef(Date.now())
  const activeSecondsRef = useRef(0)
  const lastTickRef = useRef(Date.now())
  const startPercentRef = useRef(0)
  const currentPercentRef = useRef(0)
  const submittedRef = useRef(false)

  const submit = useCallback(() => {
    if (submittedRef.current) return
    if (!config.isAuthenticated) return
    if (!config.editionId && !config.userBookId) return

    const duration = activeSecondsRef.current
    if (duration < MIN_SECONDS) return

    submittedRef.current = true
    const wordsRead = Math.round(
      Math.abs(currentPercentRef.current - startPercentRef.current) * config.wordCount
    )

    const now = new Date()
    const data: Parameters<typeof readingTrackingApi.submitSession>[0] = {
      durationSeconds: Math.min(duration, 14400),
      wordsRead,
      startPercent: startPercentRef.current,
      endPercent: currentPercentRef.current,
      startedAt: new Date(startTimeRef.current).toISOString(),
      endedAt: now.toISOString(),
    }
    if (config.editionId) data.editionId = config.editionId
    if (config.userBookId) data.userBookId = config.userBookId

    readingTrackingApi.submitSession(data).catch(() => {})
  }, [config.isAuthenticated, config.editionId, config.userBookId, config.wordCount])

  // Heartbeat: increment active seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const elapsed = Math.round((now - lastTickRef.current) / 1000)
      lastTickRef.current = now
      activeSecondsRef.current += Math.min(elapsed, 60) // cap to avoid huge jumps
    }, HEARTBEAT_MS)
    return () => clearInterval(interval)
  }, [])

  // AppState: submit on background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        submit()
      } else if (state === 'active' && submittedRef.current) {
        // Resuming — start new session
        submittedRef.current = false
        startTimeRef.current = Date.now()
        lastTickRef.current = Date.now()
        activeSecondsRef.current = 0
        startPercentRef.current = currentPercentRef.current
      }
    })
    return () => sub.remove()
  }, [submit])

  // Submit on unmount
  useEffect(() => {
    return () => { submit() }
  }, [submit])

  const updateProgress = useCallback((progress: number) => {
    if (startPercentRef.current === 0 && currentPercentRef.current === 0) {
      startPercentRef.current = progress
    }
    currentPercentRef.current = progress
  }, [])

  return { updateProgress, sessionStartedAt: startTimeRef.current }
}
