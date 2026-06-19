import { useState, useCallback, useRef, useEffect } from 'react'
import { ask as askApi, askUserBook as askUserBookApi, type AskCitation, type AskTarget } from '../api/ask'
import { ApiError } from '../api/client'

export interface AskTurn {
  question: string
  answer: string
  citations: AskCitation[]
  insufficient: boolean
}

/**
 * Session "Ask this book" state (AI-026a): an in-memory Q&A history (not persisted), plus loading
 * and error. `ask` appends a turn; in-flight requests are aborted on a new question / unmount.
 *
 * `target.kind` (AI-027 P2) routes the POST — catalog `/books/{id}/ask` vs user-upload
 * `/me/books/{id}/ask`.
 */
export function useAsk(target: AskTarget | undefined, currentChapterId?: string) {
  const id = target?.id
  const kind = target?.kind
  const [history, setHistory] = useState<AskTurn[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim()
      if (!q || !id || isLoading) return

      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setIsLoading(true)
      setError(null)

      try {
        const fn = kind === 'userbook' ? askUserBookApi : askApi
        const res = await fn(id, q, undefined, ctrl.signal, currentChapterId)
        setHistory(prev => [
          ...prev,
          { question: q, answer: res.answer, citations: res.citations, insufficient: res.insufficient },
        ])
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return
        if (err instanceof ApiError && err.status === 401) setError('auth')
        else setError(err instanceof Error ? err.message : 'Ask failed')
      } finally {
        if (abortRef.current === ctrl) setIsLoading(false)
      }
    },
    [id, kind, isLoading, currentChapterId],
  )

  return { history, isLoading, error, ask }
}
