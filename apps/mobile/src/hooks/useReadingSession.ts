import { useEffect, useRef, useCallback } from 'react'
import { AppState } from 'react-native'
import { readingTrackingApi } from '@textstack/shared'
import { trackReadingSessionEnd } from '../lib/analytics'

const HEARTBEAT_MS = 30_000
const MIN_SECONDS = 10
const IDLE_THRESHOLD_MS = 3 * 60 * 1000 // 3 min — stop counting
const AUTO_END_MS = 5 * 60 * 1000 // 5 min — auto-end session

interface SessionConfig {
  editionId: string | null
  userBookId?: string | null
  wordCount: number
  isAuthenticated: boolean
}

/**
 * Tracks reading session duration with idle detection.
 * Session starts on mount, ends on unmount, app background, or 5min idle.
 * Stops counting after 3min without activity (scroll/progress update).
 */
export function useReadingSession(config: SessionConfig) {
  const startTimeRef = useRef(Date.now())
  const activeSecondsRef = useRef(0)
  const lastTickRef = useRef(Date.now())
  const lastActivityRef = useRef(Date.now())
  const startPercentRef = useRef(0)
  const currentPercentRef = useRef(0)
  const submittedRef = useRef(false)
  const autoEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    trackReadingSessionEnd({
      durationSeconds: data.durationSeconds,
      wordsRead,
      startPercent: startPercentRef.current,
      endPercent: currentPercentRef.current,
      editionId: config.editionId,
      userBookId: config.userBookId,
    })
  }, [config.isAuthenticated, config.editionId, config.userBookId, config.wordCount])

  const resetAutoEndTimer = useCallback(() => {
    if (autoEndTimerRef.current) clearTimeout(autoEndTimerRef.current)
    autoEndTimerRef.current = setTimeout(() => {
      submit() // auto-end after 5min idle
    }, AUTO_END_MS)
  }, [submit])

  // Heartbeat: increment active seconds only if not idle
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const sinceActivity = now - lastActivityRef.current
      if (sinceActivity < IDLE_THRESHOLD_MS) {
        const elapsed = Math.round((now - lastTickRef.current) / 1000)
        activeSecondsRef.current += Math.min(elapsed, 60)
      }
      lastTickRef.current = now
    }, HEARTBEAT_MS)
    return () => clearInterval(interval)
  }, [])

  // AppState: submit on background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        submit()
        if (autoEndTimerRef.current) clearTimeout(autoEndTimerRef.current)
      } else if (state === 'active' && submittedRef.current) {
        // Resuming — start new session
        submittedRef.current = false
        startTimeRef.current = Date.now()
        lastTickRef.current = Date.now()
        lastActivityRef.current = Date.now()
        activeSecondsRef.current = 0
        startPercentRef.current = currentPercentRef.current
        resetAutoEndTimer()
      }
    })
    return () => sub.remove()
  }, [submit, resetAutoEndTimer])

  // Submit on unmount
  useEffect(() => {
    resetAutoEndTimer()
    return () => {
      submit()
      if (autoEndTimerRef.current) clearTimeout(autoEndTimerRef.current)
    }
  }, [submit, resetAutoEndTimer])

  const updateProgress = useCallback((progress: number) => {
    lastActivityRef.current = Date.now() // user is active (scrolling)
    if (startPercentRef.current === 0 && currentPercentRef.current === 0) {
      startPercentRef.current = progress
    }
    currentPercentRef.current = progress

    // Reset auto-end timer on activity
    if (autoEndTimerRef.current) clearTimeout(autoEndTimerRef.current)
    autoEndTimerRef.current = setTimeout(() => {
      submit()
    }, AUTO_END_MS)
  }, [submit])

  return { updateProgress, sessionStartedAt: startTimeRef.current }
}
