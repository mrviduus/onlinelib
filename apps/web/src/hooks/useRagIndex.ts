import { useState, useCallback, useRef, useEffect } from 'react'
import {
  getIndexStatus,
  prepareIndex,
  getUserIndexStatus,
  prepareUserIndex,
  type AskTarget,
} from '../api/ask'
import type { RagIndexState, RagIndexStatus } from '../types/api'

const POLL_INTERVAL_MS = 3000

export interface RagIndexHook {
  status: RagIndexStatus
  chunkCount: number
  embeddedCount: number
  /** True while a `prepare()` POST is in flight (before the first poll resolves). */
  preparing: boolean
  /** Triggers indexing, then polls until Ready/Failed. */
  prepare: () => void
}

/** Picks the status/prepare endpoints for the target kind (catalog vs user-uploaded). */
function endpointsFor(target: AskTarget | undefined): {
  getStatus: (id: string, signal?: AbortSignal) => Promise<RagIndexState>
  postPrepare: (id: string, signal?: AbortSignal) => Promise<RagIndexState>
} {
  if (target?.kind === 'userbook') {
    return { getStatus: getUserIndexStatus, postPrepare: prepareUserIndex }
  }
  return { getStatus: getIndexStatus, postPrepare: prepareIndex }
}

/**
 * On-demand per-book RAG index state (AI-027). Seeds from the book's `ragStatus` / counts (threaded
 * via {@link AskTarget}) so the panel renders correctly on load with no extra fetch. `prepare()`
 * POSTs to start indexing, then polls every ~3s while `status === 'Indexing'`, stopping at
 * Ready/Failed. The poll interval is cleaned up on unmount and whenever indexing finishes.
 *
 * The `target.kind` (`edition` | `userbook`) selects the endpoint family — `/books/{id}/...` for
 * catalog editions (P1), `/me/books/{id}/...` for user uploads (P2).
 */
export function useRagIndex(target: AskTarget | undefined): RagIndexHook {
  const id = target?.id
  const [status, setStatus] = useState<RagIndexStatus>(target?.ragStatus ?? 'NotIndexed')
  const [chunkCount, setChunkCount] = useState(target?.ragChunkCount ?? 0)
  const [embeddedCount, setEmbeddedCount] = useState(target?.ragEmbeddedCount ?? 0)
  const [preparing, setPreparing] = useState(false)

  // Keep the endpoint pair in a ref so the poll/prepare callbacks don't churn on every render.
  const endpointsRef = useRef(endpointsFor(target))
  endpointsRef.current = endpointsFor(target)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Cleanup on unmount.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopPolling()
      abortRef.current?.abort()
    }
  }, [stopPolling])

  const poll = useCallback(async () => {
    if (!id) return
    try {
      const res = await endpointsRef.current.getStatus(id)
      // The interval is cleared on unmount, but an already-in-flight poll can still resolve after
      // unmount — guard the setState to avoid an update on an unmounted component.
      if (!mountedRef.current) return
      setStatus(res.status)
      setChunkCount(res.chunkCount)
      setEmbeddedCount(res.embeddedCount)
      if (res.status !== 'Indexing') stopPolling()
    } catch {
      // Transient poll failure — keep polling; a persistent failure surfaces via the next tick.
    }
  }, [id, stopPolling])

  const startPolling = useCallback(() => {
    stopPolling()
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS)
  }, [poll, stopPolling])

  const prepare = useCallback(async () => {
    if (!id || preparing) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setPreparing(true)
    try {
      const res = await endpointsRef.current.postPrepare(id, ctrl.signal)
      if (!mountedRef.current) return
      setStatus(res.status)
      setChunkCount(res.chunkCount)
      setEmbeddedCount(res.embeddedCount)
      if (res.status === 'Indexing') startPolling()
    } catch {
      if (mountedRef.current) setStatus('Failed')
    } finally {
      if (mountedRef.current && abortRef.current === ctrl) setPreparing(false)
    }
  }, [id, preparing, startPolling])

  // If we mount already mid-index (seeded), pick up polling.
  useEffect(() => {
    if (status === 'Indexing' && !timerRef.current) startPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { status, chunkCount, embeddedCount, preparing, prepare }
}
