import { authFetch } from './client'
import type { AskResponse, AskCitation, AskTurnDto } from '@textstack/shared'
import { postSse } from '../lib/sse'
import type { RagIndexState, RagIndexStatus } from '../types/api'

export type { AskResponse, AskCitation, AskTurnDto } from '@textstack/shared'
export type { RagIndexState, RagIndexStatus } from '../types/api'

// API_BASE: host (dev) or '' (prod, nginx strips /api). Backend route has no prefix.
const API_BASE = import.meta.env.VITE_API_URL ?? ''

/** Most recent conversation turns to send back for multi-turn context (AI-026e). */
export const MAX_HISTORY_TURNS = 6

/** Terminal `done` payload of a streamed ask (AI-026e). */
export interface AskDone {
  citations: AskCitation[]
  lastReadOrd: number
  insufficient: boolean
}

interface AskStreamCallbacks {
  onDelta: (fragment: string) => void
  onDone: (done: AskDone) => void
  onError: (message: string) => void
  signal?: AbortSignal
}

/**
 * Streaming "Ask this book" (AI-026e). POSTs the question + bounded `history` with
 * `Accept: text/event-stream` and consumes SSE via {@link postSse}: `delta` fragments append to the
 * answer, `done` carries citations/insufficient, `error` surfaces a message. URL routes by
 * `target.kind` (catalog vs userbook). Throws `SseUnauthorizedError`/`SseUnsupportedError` from
 * `postSse` for the caller to handle (sign-in / JSON fallback).
 */
export function askStream(
  target: AskTarget,
  question: string,
  history: AskTurnDto[],
  { onDelta, onDone, onError, signal }: AskStreamCallbacks,
  currentChapterId?: string,
): Promise<void> {
  const url =
    target.kind === 'userbook'
      ? `${API_BASE}/me/books/${target.id}/ask`
      : `${API_BASE}/books/${target.id}/ask`
  const body = {
    question,
    history: history.slice(-MAX_HISTORY_TURNS),
    ...(currentChapterId ? { currentChapterId } : {}),
  }
  return postSse(
    url,
    body,
    e => {
      if (signal?.aborted) return
      if (e.event === 'delta') onDelta(e.data)
      else if (e.event === 'done') {
        try {
          const parsed = JSON.parse(e.data) as Partial<AskDone>
          onDone({
            citations: parsed.citations ?? [],
            lastReadOrd: parsed.lastReadOrd ?? 0,
            insufficient: Boolean(parsed.insufficient),
          })
        } catch {
          onDone({ citations: [], lastReadOrd: 0, insufficient: false })
        }
      } else if (e.event === 'error') onError(e.data || 'Ask failed')
    },
    signal,
  )
}

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
