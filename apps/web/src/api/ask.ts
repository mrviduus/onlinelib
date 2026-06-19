import { authFetch } from './client'
import type { AskResponse } from '@textstack/shared'
import type { RagIndexState } from '../types/api'

export type { AskResponse, AskCitation } from '@textstack/shared'
export type { RagIndexState, RagIndexStatus } from '../types/api'

/**
 * On-demand RAG index (AI-027 P1). Reads the current index state for a catalog edition.
 * Cookie auth via {@link authFetch}; throws `ApiError` on failure.
 */
export function getIndexStatus(editionId: string, signal?: AbortSignal): Promise<RagIndexState> {
  return authFetch<RagIndexState>(`/books/${editionId}/index`, { method: 'GET', signal })
}

/**
 * Triggers (or re-triggers) indexing for a catalog edition. Returns the (possibly still `Indexing`)
 * state; the caller polls {@link getIndexStatus} until it reaches `Ready`/`Failed`.
 */
export function prepareIndex(editionId: string, signal?: AbortSignal): Promise<RagIndexState> {
  return authFetch<RagIndexState>(`/books/${editionId}/index`, { method: 'POST', signal })
}

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
