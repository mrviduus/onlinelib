import { useState, useCallback, useRef, useEffect } from 'react'
import { runStudyBuddy, type StudyBuddyStep } from '../api/studybuddy'
import { SseUnauthorizedError } from '../lib/sse'

export type StudyBuddyStatus = 'idle' | 'running' | 'done' | 'error'

interface StudyBuddyState {
  status: StudyBuddyStatus
  steps: StudyBuddyStep[]
  answer: string | null
  error: string | null // 'auth' when sign-in is required
}

const INITIAL: StudyBuddyState = { status: 'idle', steps: [], answer: null, error: null }

/**
 * Streams a Study Buddy run (AI-038): `steps` grows as the agent works, `answer` is set on the
 * terminal `done`. A new `run` aborts any in-flight one; the controller is also aborted on unmount.
 * 401 surfaces as `error: 'auth'` so the panel can prompt sign-in.
 */
export function useStudyBuddy(editionId: string | undefined) {
  const [state, setState] = useState<StudyBuddyState>(INITIAL)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const run = useCallback(
    async (passage: string, chapterNumber: number | null) => {
      const text = passage.trim()
      if (!text || !editionId) return

      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setState({ status: 'running', steps: [], answer: null, error: null })

      try {
        await runStudyBuddy(
          editionId,
          text,
          chapterNumber,
          {
            onStep: step =>
              setState(prev => (prev.status === 'running' ? { ...prev, steps: [...prev.steps, step] } : prev)),
            onDone: done =>
              setState(prev => ({ ...prev, status: 'done', answer: done.answer })),
            onError: message =>
              setState(prev => ({ ...prev, status: 'error', error: message })),
          },
          ctrl.signal,
        )
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return
        if (err instanceof SseUnauthorizedError) {
          setState(prev => ({ ...prev, status: 'error', error: 'auth' }))
          return
        }
        setState(prev => ({ ...prev, status: 'error', error: err instanceof Error ? err.message : 'Study Buddy failed' }))
      }
    },
    [editionId],
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setState(INITIAL)
  }, [])

  return { ...state, run, reset }
}
