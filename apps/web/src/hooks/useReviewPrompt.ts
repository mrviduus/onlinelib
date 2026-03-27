import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { getVocabStats } from '../api/vocabulary'

const REVIEW_PROMPT_KEY = 'vocab.reviewPromptDue'

/**
 * On unmount (reader exit), stores dueNow count in sessionStorage.
 * Other pages can pick it up via getReviewPrompt().
 */
export function useReviewPrompt() {
  const { isAuthenticated } = useAuth()
  const dueRef = useRef(0)

  useEffect(() => {
    if (!isAuthenticated) return
    getVocabStats()
      .then((stats) => { dueRef.current = stats.dueNow })
      .catch(() => {})
  }, [isAuthenticated])

  useEffect(() => {
    return () => {
      if (dueRef.current > 0) {
        try {
          sessionStorage.setItem(REVIEW_PROMPT_KEY, String(dueRef.current))
        } catch {}
      }
    }
  }, [])
}

/** Consume the review prompt (returns count and clears it) */
export function consumeReviewPrompt(): number {
  try {
    const val = sessionStorage.getItem(REVIEW_PROMPT_KEY)
    if (val) {
      sessionStorage.removeItem(REVIEW_PROMPT_KEY)
      return parseInt(val, 10) || 0
    }
  } catch {}
  return 0
}
