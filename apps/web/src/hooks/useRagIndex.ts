import { useState, useCallback, useRef, useEffect } from 'react'
import { getIndexStatus, prepareIndex } from '../api/ask'
import type { RagIndexStatus } from '../types/api'

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

/**
 * On-demand per-book RAG index state (AI-027 P1). Seeds from the catalog book's `ragStatus` /
 * counts so the panel renders correctly on load with no extra fetch. `prepare()` POSTs to start
 * indexing, then polls `getIndexStatus` every ~3s while `status === 'Indexing'`, stopping at
 * Ready/Failed. The poll interval is cleaned up on unmount and whenever indexing finishes.
 */
export function useRagIndex(
  editionId: string | undefined,
  initialStatus?: RagIndexStatus,
  initialChunkCount?: number,
  initialEmbeddedCount?: number,
): RagIndexHook {
  const [status, setStatus] = useState<RagIndexStatus>(initialStatus ?? 'NotIndexed')
  const [chunkCount, setChunkCount] = useState(initialChunkCount ?? 0)
  const [embeddedCount, setEmbeddedCount] = useState(initialEmbeddedCount ?? 0)
  const [preparing, setPreparing] = useState(false)

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
    if (!editionId) return
    try {
      const res = await getIndexStatus(editionId)
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
  }, [editionId, stopPolling])

  const startPolling = useCallback(() => {
    stopPolling()
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS)
  }, [poll, stopPolling])

  const prepare = useCallback(async () => {
    if (!editionId || preparing) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setPreparing(true)
    try {
      const res = await prepareIndex(editionId, ctrl.signal)
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
  }, [editionId, preparing, startPolling])

  // If we mount already mid-index (seeded), pick up polling.
  useEffect(() => {
    if (status === 'Indexing' && !timerRef.current) startPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { status, chunkCount, embeddedCount, preparing, prepare }
}
