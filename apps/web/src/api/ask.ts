import { authFetch } from './client'
import type { AskResponse } from '@textstack/shared'
import type { RagIndexState, RagIndexStatus } from '../types/api'

export type { AskResponse, AskCitation } from '@textstack/shared'
export type { RagIndexState, RagIndexStatus } from '../types/api'

/**
 * Identifies what the "Ask this book" panel is pointed at (AI-027 P2). A catalog `edition`
 * routes to `/books/{id}/...`; a user-uploaded `userbook` routes to `/me/books/{id}/...`.
 * The reader builds this from whichever book it loaded and threads it through the panel/hooks.
 */
export interface AskTarget {
  kind: 'edition' | 'userbook'
  id: string
  ragStatus?: RagIndexStatus
  ragChunkCount?: number
  ragEmbeddedCount?: number
}

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

/**
 * User-uploaded book variant of {@link getIndexStatus} (AI-027 P2). Owner-scoped via cookie auth.
 */
export function getUserIndexStatus(id: string, signal?: AbortSignal): Promise<RagIndexState> {
  return authFetch<RagIndexState>(`/me/books/${id}/index`, { method: 'GET', signal })
}

/**
 * User-uploaded book variant of {@link prepareIndex} (AI-027 P2). Owner-scoped.
 */
export function prepareUserIndex(id: string, signal?: AbortSignal): Promise<RagIndexState> {
  return authFetch<RagIndexState>(`/me/books/${id}/index`, { method: 'POST', signal })
}

/**
 * User-uploaded book variant of {@link ask} (AI-027 P2). No spoiler gate — it's the user's own
 * document, so answers draw from the whole book; `currentChapterId` is still passed for citation
 * context. Owner-scoped via cookie auth; throws `ApiError` on failure.
 */
export function askUserBook(
  id: string,
  question: string,
  k?: number,
  signal?: AbortSignal,
  currentChapterId?: string,
): Promise<AskResponse> {
  return authFetch<AskResponse>(`/me/books/${id}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, k, ...(currentChapterId ? { currentChapterId } : {}) }),
    signal,
  })
}
