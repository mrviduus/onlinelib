import { useCallback, useEffect, useRef, useState } from 'react'
import { isOfflineError } from '@textstack/shared'
import { useReconnectCount } from './useOnline'
import type { LoadStatus } from '../lib/loadState'

/**
 * Runs a screen's load and remembers why it went wrong.
 *
 * It deliberately does NOT own the data. Library reads three endpoints and a
 * SQLite cache; Discover reads three more and has nothing to fall back on;
 * Vocabulary reads a list, a queue and a stats blob. Pretending those are one
 * shape is how a "generic data hook" ends up with six options nobody
 * understands. The screen keeps its own state and does its own fetching; this
 * owns the one part that must be identical everywhere — classifying the failure,
 * retrying, and coming back when the network does.
 *
 * The reconnect refetch is the point of the hook as much as the classification.
 * Discover's offline banner survived the network returning because the only
 * thing that cleared it was a successful re-run of an effect keyed on
 * `[language]`, and a tab screen never unmounts. Every screen that uses this
 * gets the reconnect behaviour by construction rather than by remembering.
 */
export function useLoadState(
  load: () => Promise<void>,
  deps: readonly unknown[] = [],
): {
  status: LoadStatus
  /** Re-run the load. Safe to pass straight to a retry button. */
  reload: () => void
} {
  const [status, setStatus] = useState<LoadStatus>('loading')
  const reconnects = useReconnectCount()
  const [attempt, setAttempt] = useState(0)

  // Always the latest closure, so the effect below can depend on the caller's
  // `deps` rather than on the identity of a function they would have to
  // remember to memoize.
  const loadRef = useRef(load)
  loadRef.current = load

  // Guards a resolution that arrives after the screen moved on — a slower first
  // request landing behind a retry would otherwise overwrite the newer answer.
  const genRef = useRef(0)

  useEffect(() => {
    const gen = ++genRef.current
    setStatus('loading')
    loadRef.current()
      .then(() => { if (gen === genRef.current) setStatus('ready') })
      .catch(e => {
        if (gen !== genRef.current) return
        // A 500 is not "check your connection". Telling a reader to look at
        // their wifi while the backend is on fire sends them away from the
        // actual problem, and away from the retry that would work.
        setStatus(isOfflineError(e) ? 'offline' : 'failed')
      })
    return () => { genRef.current++ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, reconnects, ...deps])

  const reload = useCallback(() => setAttempt(a => a + 1), [])

  return { status, reload }
}
