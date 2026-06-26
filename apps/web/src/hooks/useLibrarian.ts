import { useState, useCallback, useRef, useEffect } from 'react'
import { askLibrarian, isValidLibrarianQuery, type LibrarianResponse } from '../api/librarian'

// Phase of the librarian flow the page renders.
//  - idle    → prompt only, no request issued yet
//  - asking  → request in flight ("the librarian is thinking…")
//  - results → got a non-empty recommendation list
//  - empty   → ran fine but found no good match
//  - error   → request failed (retryable)
export type LibrarianPhase = 'idle' | 'asking' | 'results' | 'empty' | 'error'

export function useLibrarian() {
  const [phase, setPhase] = useState<LibrarianPhase>('idle')
  const [response, setResponse] = useState<LibrarianResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The query the current/last request was issued for — kept so retry re-runs the SAME query.
  const lastQueryRef = useRef('')

  // Mounted guard + in-flight abort so no setState fires after unmount (or after a superseded request).
  const mountedRef = useRef(true)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  const newSignal = useCallback(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    return ctrl.signal
  }, [])

  const run = useCallback(async (query: string) => {
    // Client guard mirrors the backend min-length so we don't burn a rate-limited agent run on junk.
    if (!isValidLibrarianQuery(query)) return
    lastQueryRef.current = query
    setPhase('asking')
    setError(null)
    const signal = newSignal()
    try {
      const res = await askLibrarian(query, signal)
      if (!mountedRef.current || signal.aborted) return
      setResponse(res)
      setPhase(res.recommendations.length === 0 ? 'empty' : 'results')
    } catch (err) {
      if (!mountedRef.current || signal.aborted) return
      setError(err instanceof Error ? err.message : 'Failed to reach the librarian')
      setPhase('error')
    }
  }, [newSignal])

  const retry = useCallback(() => {
    if (lastQueryRef.current) void run(lastQueryRef.current)
  }, [run])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setPhase('idle')
    setResponse(null)
    setError(null)
    lastQueryRef.current = ''
  }, [])

  return { phase, response, error, run, retry, reset }
}
