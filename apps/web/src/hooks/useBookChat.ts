import { useState, useCallback, useRef, useEffect } from 'react'
import {
  getBookChat,
  sendChatMessage,
  sendChatMessageJson,
  setSpoilerGate as setSpoilerGateApi,
  clearBookChat,
  type BookChatMessage,
} from '../api/bookChat'
import type { AskTarget } from '../api/ask'
import { ApiError } from '../api/client'
import { SseUnauthorizedError, SseUnsupportedError } from '../lib/sse'
import type { AskTurn } from './useAsk'

export type { AskTurn } from './useAsk'

/**
 * Flattens the server's ordered message list into the Q&A turn shape the panel renders. An
 * assistant message fills the preceding user turn's answer; a stray assistant (no pending user
 * turn) becomes its own answer-only turn. `insufficient` is not persisted → always false on reload.
 */
function messagesToTurns(messages: BookChatMessage[]): AskTurn[] {
  const turns: AskTurn[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      turns.push({ question: m.content, answer: '', citations: [], insufficient: false, streaming: false })
    } else {
      const last = turns[turns.length - 1]
      if (last && last.answer === '') {
        turns[turns.length - 1] = { ...last, answer: m.content, citations: m.citations ?? [] }
      } else {
        turns.push({ question: '', answer: m.content, citations: m.citations ?? [], insufficient: false, streaming: false })
      }
    }
  }
  return turns
}

/**
 * Persistent per-book chat (NotebookLM model — one book = one conversation). On open it loads the
 * server-owned history (auto-creating an empty conversation); `ask` optimistically appends a user
 * turn and streams the answer token-by-token — the client sends NO history (the server persists both
 * turns). Exposes the spoiler gate (optimistic PATCH) and a clear action (optimistic empty). The RAG
 * index prepare/status flow stays in `useRagIndex` — chat only works once the index is Ready.
 *
 * `enabled` gates the initial GET (the panel passes `open && isAuthenticated`) so a closed panel /
 * signed-out reader never fetches; a 401 degrades to the `'auth'` error the panel renders as sign-in.
 */
export function useBookChat(
  target: AskTarget | undefined,
  currentChapterId?: string,
  enabled = true,
) {
  const [history, setHistory] = useState<AskTurn[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [spoilerGateEnabled, setSpoilerGateEnabled] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  // Load the persisted conversation when the panel opens for a target. Keyed on kind:id so a
  // book switch reloads; `enabled` (open && authed) prevents fetches while closed/signed-out.
  const loadKey = enabled && target ? `${target.kind}:${target.id}` : null
  useEffect(() => {
    if (!loadKey || !target) return
    let cancelled = false
    setHistoryLoading(true)
    setError(null)
    getBookChat(target)
      .then(conv => {
        if (cancelled) return
        setConversationId(conv.conversationId)
        setSpoilerGateEnabled(conv.spoilerGateEnabled)
        setHistory(messagesToTurns(conv.messages))
      })
      .catch(err => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) setError('auth')
        else setError(err instanceof Error ? err.message : 'Failed to load chat')
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- target is stable per loadKey
  }, [loadKey])

  /** Append a fragment to the last (streaming) turn's answer. */
  const appendDelta = useCallback((fragment: string) => {
    setHistory(prev => {
      if (prev.length === 0) return prev
      const next = prev.slice()
      const last = next[next.length - 1]
      next[next.length - 1] = { ...last, answer: last.answer + fragment }
      return next
    })
  }, [])

  const finishTurn = useCallback((patch: Partial<AskTurn>) => {
    setHistory(prev => {
      if (prev.length === 0) return prev
      const next = prev.slice()
      const last = next[next.length - 1]
      next[next.length - 1] = { ...last, ...patch, streaming: false }
      return next
    })
  }, [])

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim()
      if (!q || !target || !conversationId || isLoading) return

      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setIsLoading(true)
      setError(null)

      setHistory(prev => [
        ...prev,
        { question: q, answer: '', citations: [], insufficient: false, streaming: true },
      ])

      try {
        await sendChatMessage(conversationId, q, currentChapterId, {
          onDelta: appendDelta,
          onDone: done => {
            if (ctrl.signal.aborted) return
            finishTurn({ citations: done.citations, insufficient: done.insufficient })
          },
          onError: msg => {
            if (ctrl.signal.aborted) return
            finishTurn({})
            setError(msg)
          },
          signal: ctrl.signal,
        })
        if (!ctrl.signal.aborted) finishTurn({})
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return
        if (ctrl.signal.aborted) return

        // No streaming support → one-shot JSON request against the same endpoint.
        if (err instanceof SseUnsupportedError) {
          try {
            const res = await sendChatMessageJson(conversationId, q, currentChapterId, ctrl.signal)
            if (ctrl.signal.aborted) return
            finishTurn({ answer: res.answer, citations: res.citations, insufficient: res.insufficient })
          } catch (fallbackErr) {
            if ((fallbackErr as { name?: string })?.name === 'AbortError') return
            finishTurn({})
            if (fallbackErr instanceof ApiError && fallbackErr.status === 401) setError('auth')
            else setError(fallbackErr instanceof Error ? fallbackErr.message : 'Ask failed')
          }
        } else if (err instanceof SseUnauthorizedError) {
          finishTurn({})
          setError('auth')
        } else {
          finishTurn({})
          setError(err instanceof Error ? err.message : 'Ask failed')
        }
      } finally {
        if (abortRef.current === ctrl && mountedRef.current) setIsLoading(false)
      }
    },
    [target, conversationId, currentChapterId, isLoading, appendDelta, finishTurn],
  )

  const setSpoilerGate = useCallback(
    (next: boolean) => {
      if (!conversationId) return
      const prev = spoilerGateEnabled
      setSpoilerGateEnabled(next) // optimistic
      setSpoilerGateApi(conversationId, next).catch(() => {
        if (mountedRef.current) setSpoilerGateEnabled(prev)
      })
    },
    [conversationId, spoilerGateEnabled],
  )

  const clearChat = useCallback(() => {
    if (!conversationId) return
    const prev = history
    setHistory([]) // optimistic
    clearBookChat(conversationId).catch(() => {
      if (mountedRef.current) setHistory(prev)
    })
  }, [conversationId, history])

  return {
    history,
    conversationId,
    spoilerGateEnabled,
    setSpoilerGate,
    clearChat,
    historyLoading,
    isLoading,
    error,
    ask,
  }
}
