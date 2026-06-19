import { useState, useCallback, useRef, useEffect } from 'react'
import {
  ask as askJsonApi,
  askUserBook as askUserBookJsonApi,
  askStream,
  MAX_HISTORY_TURNS,
  type AskCitation,
  type AskTarget,
  type AskTurnDto,
} from '../api/ask'
import { ApiError } from '../api/client'
import { SseUnauthorizedError, SseUnsupportedError } from '../lib/sse'

export interface AskTurn {
  question: string
  answer: string
  citations: AskCitation[]
  insufficient: boolean
  /** True while the answer is still streaming in (token-by-token). */
  streaming: boolean
}

/** Flattens the visible Q&A history into the user/assistant turn list the server expects. */
function toDto(history: AskTurn[]): AskTurnDto[] {
  const turns: AskTurnDto[] = []
  for (const t of history) {
    turns.push({ role: 'user', content: t.question })
    if (t.answer) turns.push({ role: 'assistant', content: t.answer })
  }
  return turns
}

/**
 * Session "Ask this book" state (AI-026e): a streamed, multi-turn in-memory Q&A history (not
 * persisted), plus loading and error. `ask` optimistically appends a turn, streams the answer
 * token-by-token (`delta` → append; `done` → citations/insufficient), and sends the last 6 turns
 * for context. In-flight requests abort on a new question / unmount.
 *
 * `target.kind` (AI-027 P2) routes the request — catalog `/books/{id}/ask` vs user-upload
 * `/me/books/{id}/ask`. Browsers that can't stream fall back to the JSON single-turn endpoint.
 */
export function useAsk(target: AskTarget | undefined, currentChapterId?: string) {
  const [history, setHistory] = useState<AskTurn[]>([])
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

  const finishTurn = useCallback(
    (patch: Partial<AskTurn>) => {
      setHistory(prev => {
        if (prev.length === 0) return prev
        const next = prev.slice()
        const last = next[next.length - 1]
        next[next.length - 1] = { ...last, ...patch, streaming: false }
        return next
      })
    },
    [],
  )

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim()
      if (!q || !target || isLoading) return

      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setIsLoading(true)
      setError(null)

      // History to send is the last N turns *before* this question, flattened to messages.
      const priorHistory = toDto(history.slice(-MAX_HISTORY_TURNS))
      setHistory(prev => [
        ...prev,
        { question: q, answer: '', citations: [], insufficient: false, streaming: true },
      ])

      try {
        await askStream(
          target,
          q,
          priorHistory,
          {
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
          },
          currentChapterId,
        )
        if (!ctrl.signal.aborted) finishTurn({})
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return
        if (ctrl.signal.aborted) return

        // No streaming support → one-shot JSON request (single-turn fallback).
        if (err instanceof SseUnsupportedError) {
          try {
            const fn = target.kind === 'userbook' ? askUserBookJsonApi : askJsonApi
            const res = await fn(target.id, q, undefined, ctrl.signal, currentChapterId)
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
    [target, isLoading, history, currentChapterId, appendDelta, finishTurn],
  )

  return { history, isLoading, error, ask }
}
