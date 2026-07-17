import { authFetch, type AskCitation, type AskResponse, type AskTarget } from '@textstack/shared'
import { API_URL, getAccessToken, onUnauthorized } from './api'
import { postSse, SseUnauthorizedError } from './sse'
import { makeAskSseHandler, type AskStreamCallbacks } from './sseParser'

// Persistent per-book chat (NotebookLM model — one book = one conversation) for the mobile reader.
// Mirrors the web client (apps/web/src/api/bookChat.ts) against the SAME backend contract:
//   GET   /me/chat?editionId=|userBookId=            → auto-creates + returns history
//   POST  /me/chat/{conversationId}/messages         → SSE (identical wire to legacy /ask)
//   PATCH /me/chat/{conversationId}                  → spoiler gate
//   DELETE /me/chat/{conversationId}/messages        → clear history
// Bearer auth via the shared `authFetch` (GET/PATCH/DELETE + JSON fallback); the streaming POST goes
// through expo/fetch (./sse) with the Bearer token threaded manually + a single 401 refresh-retry.

/** One persisted turn of a book chat (server-owned ordering). Citations mirror the ask `done` shape. */
export interface BookChatMessage {
  ord: number
  role: 'user' | 'assistant'
  content: string
  citations?: AskCitation[]
}

/** The persistent per-book conversation, auto-created server-side on first {@link getBookChat}. */
export interface BookChatConversation {
  conversationId: string
  spoilerGateEnabled: boolean
  messages: BookChatMessage[]
}

/** Query fragment selecting the catalog edition vs the user-uploaded book. */
function targetQuery(target: AskTarget): string {
  return target.kind === 'userbook' ? `userBookId=${target.id}` : `editionId=${target.id}`
}

/**
 * Loads (auto-creating) the persistent conversation for a book. Bearer auth via `authFetch`;
 * throws `ApiError` (401 → caller degrades to the sign-in prompt) on failure.
 */
export function getBookChat(target: AskTarget, signal?: AbortSignal): Promise<BookChatConversation> {
  return authFetch<BookChatConversation>(`/me/chat?${targetQuery(target)}`, { method: 'GET', signal })
}

/**
 * Streams an answer for a new question in an existing conversation. Identical SSE wire format to the
 * legacy `/ask` — the server persists BOTH turns, so the client sends NO history. On a 401 (token
 * expired mid-session) it refreshes once via `onUnauthorized` and retries; a still-401 rethrows so
 * the caller surfaces sign-in.
 */
export async function sendChatMessage(
  conversationId: string,
  question: string,
  currentChapterId: string | undefined,
  handlers: AskStreamCallbacks,
): Promise<void> {
  const url = `${API_URL}/me/chat/${conversationId}/messages`
  const body = { question, ...(currentChapterId ? { currentChapterId } : {}) }
  const onEvent = makeAskSseHandler(handlers)

  const token = await getAccessToken()
  try {
    await postSse(url, token, body, onEvent, handlers.signal)
  } catch (err) {
    // Retry ONCE with a refreshed token. The stream hasn't emitted anything yet — a 401 is decided
    // from the response status before the body is read — so re-POSTing is safe (no duplicate turns).
    if (err instanceof SseUnauthorizedError) {
      const fresh = await onUnauthorized()
      if (!fresh) throw err
      await postSse(url, fresh, body, onEvent, handlers.signal)
      return
    }
    throw err
  }
}

/**
 * Non-streaming fallback for {@link sendChatMessage} (environments with no streamable body). Same
 * endpoint, plain JSON response identical to the classic ask fallback. Bearer auth + refresh handled
 * by the shared `authFetch`.
 */
export function sendChatMessageJson(
  conversationId: string,
  question: string,
  currentChapterId?: string,
  signal?: AbortSignal,
): Promise<AskResponse> {
  return authFetch<AskResponse>(`/me/chat/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, ...(currentChapterId ? { currentChapterId } : {}) }),
    signal,
  })
}

/** Toggles the spoiler gate for a conversation (answers restricted to read chapters). */
export function setSpoilerGate(
  conversationId: string,
  enabled: boolean,
  signal?: AbortSignal,
): Promise<void> {
  return authFetch<void>(`/me/chat/${conversationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spoilerGateEnabled: enabled }),
    signal,
  })
}

/** Clears every message in a conversation (the conversation itself persists). */
export function clearBookChat(conversationId: string, signal?: AbortSignal): Promise<void> {
  return authFetch<void>(`/me/chat/${conversationId}/messages`, { method: 'DELETE', signal })
}
