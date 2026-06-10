import { useState, useCallback, useRef, useEffect } from 'react'
import { ask as askApi, type AskCitation } from '../api/ask'
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
 */
export function useAsk(editionId: string | undefined) {
  const [history, setHistory] = useState<AskTurn[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim()
      if (!q || !editionId || isLoading) return

      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setIsLoading(true)
      setError(null)

      try {
        const res = await askApi(editionId, q, undefined, ctrl.signal)
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
    [editionId, isLoading],
  )

  return { history, isLoading, error, ask }
}
