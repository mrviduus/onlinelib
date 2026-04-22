import { useState, useCallback, useRef } from 'react'
import { explain as explainApi, type ExplainRequest } from '../api/explain'
import { getCachedExplain, cacheExplain } from '../lib/offlineDb'

interface ExplainState {
  explanation: string | null
  isLoading: boolean
  error: string | null
  cached: boolean
}

const INITIAL: ExplainState = {
  explanation: null,
  isLoading: false,
  error: null,
  cached: false,
}

export function useExplain() {
  const [state, setState] = useState<ExplainState>(INITIAL)
  const abortRef = useRef<AbortController | null>(null)

  const explain = useCallback(async (req: ExplainRequest): Promise<string | null> => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setState({ explanation: null, isLoading: true, error: null, cached: false })

    const targetLang = (req.targetLang || 'en').split('-')[0]

    try {
      const hit = await getCachedExplain(req.word, req.sentence, req.genre, targetLang)
      if (hit) {
        setState({
          explanation: hit.explanation,
          isLoading: false,
          error: null,
          cached: true,
        })
        return hit.explanation
      }
    } catch {
      // cache read failed — fall through
    }

    if (!navigator.onLine) {
      setState({ explanation: null, isLoading: false, error: 'Offline', cached: false })
      return null
    }

    try {
      const result = await explainApi(req, ctrl.signal)
      setState({
        explanation: result.explanation,
        isLoading: false,
        error: null,
        cached: result.cached,
      })
      cacheExplain(req.word, req.sentence, req.genre, targetLang, result.explanation).catch(() => {})
      return result.explanation
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return null
      const error = err instanceof Error ? err.message : 'Explain failed'
      setState({ explanation: null, isLoading: false, error, cached: false })
      return null
    }
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setState(INITIAL)
  }, [])

  return { ...state, explain, reset }
}
