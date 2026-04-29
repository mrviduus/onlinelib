import { useCallback, useEffect, useRef, useState } from 'react'

type Router = { back: () => void; replace: (href: string) => void }

type Options = {
  router: Router
  saveProgress: () => void
  /** ms before the summary auto-dismisses and pops the screen. */
  autoDismissMs?: number
}

/**
 * Owns the post-reading "{N} words saved → Review now / Later" overlay.
 * Caller increments sessionWordCount on each saved word; on exit, if any
 * were saved we show the summary, else we pop immediately.
 */
export function useReaderExitSummary({ router, saveProgress, autoDismissMs = 5000 }: Options) {
  const [sessionWordCount, setSessionWordCount] = useState(0)
  const [exitSummary, setExitSummary] = useState(false)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    }
  }, [])

  const exit = useCallback(() => {
    saveProgress()
    if (sessionWordCount > 0) {
      setExitSummary(true)
      exitTimerRef.current = setTimeout(() => router.back(), autoDismissMs)
    } else {
      router.back()
    }
  }, [saveProgress, sessionWordCount, router, autoDismissMs])

  const exitToReview = useCallback(() => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    router.replace('/vocabulary/review')
  }, [router])

  const exitLater = useCallback(() => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    router.back()
  }, [router])

  return { sessionWordCount, setSessionWordCount, exitSummary, exit, exitToReview, exitLater }
}
