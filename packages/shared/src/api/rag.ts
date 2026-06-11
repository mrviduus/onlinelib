import { authFetch, jsonBody } from './client'
import type { AskResponse } from '../types/api'

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
