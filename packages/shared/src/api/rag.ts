import { authFetch, jsonBody } from './client'
import type { AskResponse, RagIndexState } from '../types/api'

/**
 * "Ask this book" (Phase 4 RAG, AI-025). Authenticated (Bearer) — spoiler-safe answer + citations
 * for a catalog edition. Used by the mobile reader; web has its own cookie-based client.
 */
export function ask(
  editionId: string,
  question: string,
  k?: number,
  signal?: AbortSignal,
): Promise<AskResponse> {
  return authFetch<AskResponse>(`/books/${editionId}/ask`, { ...jsonBody('POST', { question, k }), signal })
}

/**
 * User-uploaded book variant of {@link ask} (AI-027 P2). No spoiler gate — it's the user's own
 * document, so answers may draw from the whole book. Owner-scoped via Bearer auth.
 */
export function askUserBook(
  id: string,
  question: string,
  k?: number,
  signal?: AbortSignal,
): Promise<AskResponse> {
  return authFetch<AskResponse>(`/me/books/${id}/ask`, { ...jsonBody('POST', { question, k }), signal })
}

/**
 * On-demand RAG index (AI-027 P1). Reads the current index state for a catalog edition.
 * Bearer auth via {@link authFetch}; throws `ApiError` on failure.
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
 * User-uploaded book variant of {@link getIndexStatus} (AI-027 P2). Owner-scoped via Bearer auth.
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
