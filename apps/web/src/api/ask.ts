import { authFetch } from './client'
import type { AskResponse } from '@textstack/shared'

export type { AskResponse, AskCitation } from '@textstack/shared'

/**
 * "Ask this book" (AI-025). Authenticated POST — spoiler-safe answer + citations for a catalog
 * edition. Uses cookie auth via {@link authFetch}; throws `ApiError` (status carried) on failure.
 */
export function ask(
  editionId: string,
  question: string,
  k?: number,
  signal?: AbortSignal,
  currentChapterId?: string,
): Promise<AskResponse> {
  return authFetch<AskResponse>(`/books/${editionId}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, k, ...(currentChapterId ? { currentChapterId } : {}) }),
    signal,
  })
}
