import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'

/**
 * Calls `flush()` whenever the app transitions to background or inactive.
 *
 * Why this exists: on Android (current launch priority), OS-kill (Home
 * button → app evicted later) skips React `useEffect` cleanup, so any
 * unflushed debounced state (reading progress, draft text, queued
 * analytics) is lost. AppState 'background'/'inactive' fires reliably
 * before the kill, giving us one last sync write.
 *
 * Two readers (catalog + user-book) had this listener inlined with
 * identical structure — extracting it removes drift and gives us one
 * place to expand semantics later (e.g. also flush on Notification tap,
 * or batch with a write queue).
 *
 * Contract:
 *   - `flush()` is called from the AppState listener — it should be sync
 *     or fire-and-forget async. If it returns a Promise, no one awaits it.
 *   - Listener is re-installed if `flush` identity changes (i.e. wrap
 *     callers' flush in useCallback to avoid churn).
 *   - **Reentrancy is suppressed**: if a flush triggers a state change
 *     that causes another background→active→background cycle inside the
 *     same tick (synthetic scenarios in tests, real on rapid Android
 *     state thrash), we drop the inner call. Real I/O still happens once.
 *
 * Defensive: a `try/catch` around `flush()` keeps an exception from
 * crashing the AppState subscription — analytics, sentry, or any other
 * background flush would otherwise leak a tap into the JS error path.
 */
export function useFlushOnBackground(flush: () => void): void {
  // Reentrancy guard. Set true on entry, cleared in finally. Inner calls
  // are no-op'd so a buggy flush (state-change → re-entry) can't loop.
  const flushingRef = useRef(false)

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'background' && state !== 'inactive') return
      if (flushingRef.current) {
        if (__DEV__) console.warn('[useFlushOnBackground] reentrant flush suppressed')
        return
      }
      flushingRef.current = true
      try {
        flush()
      } catch (e) {
        // Never let analytics/save errors propagate up through AppState —
        // a thrown exception here detaches the subscription on some RN
        // versions, silently losing future flushes.
        if (__DEV__) console.warn('[useFlushOnBackground] flush threw:', e)
      } finally {
        flushingRef.current = false
      }
    })
    return () => sub.remove()
  }, [flush])
}
