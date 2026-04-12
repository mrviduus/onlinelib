import { useEffect, useCallback, useRef } from 'react'

interface VerticalSwipeOptions {
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  threshold?: number // min distance in px
  enabled?: boolean
}

// Vertical swipe detector — mirrors useSwipe but on Y axis.
// Separate hook (instead of extending useSwipe) so horizontal reader
// pagination and vertical focus-mode nav stay independent.
export function useVerticalSwipe({
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
  enabled = true,
}: VerticalSwipeOptions) {
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)

  const onStart = useCallback((e: TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
  }, [])

  const onEnd = useCallback(
    (e: TouchEvent) => {
      if (startX.current === null || startY.current === null) return
      const endX = e.changedTouches[0].clientX
      const endY = e.changedTouches[0].clientY
      const dx = endX - startX.current
      const dy = endY - startY.current

      // Only trigger if vertical swipe is dominant + crosses threshold.
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > threshold) {
        if (dy < 0) onSwipeUp?.()
        else onSwipeDown?.()
      }
      startX.current = null
      startY.current = null
    },
    [onSwipeUp, onSwipeDown, threshold],
  )

  useEffect(() => {
    if (!enabled) return
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend', onEnd)
    }
  }, [enabled, onStart, onEnd])
}
