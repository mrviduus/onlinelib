import { authFetch } from './client'
import { postSse } from '../lib/sse'
import {
  makeAskSseHandler,
  type AskCitation,
  type AskResponse,
  type AskStreamCallbacks,
  type AskTarget,
} from './ask'

export type { AskCitation, AskTarget } from './ask'

// Mirrors ask.ts: host (dev) or '' (prod, nginx strips /api). Backend route has no prefix.
const API_BASE = import.meta.env.VITE_API_URL ?? ''

/** One persisted turn of a book chat (server-owned ordering). Citations mirror the ask `done` shape. */
export interface BookChatMessage {
  ord: number
  role: 'user' | 'assistant'
  content: string
  citations?: AskCitation[]
}

/**
 * The persistent per-book conversation (NotebookLM model — one book = one chat). Returned by
 * {@link getBookChat}, which auto-creates an empty conversation server-side on first load.
 */
export interface BookChatConversation {
  conversationId: string
  spoilerGateEnabled: boolean
  messages: BookChatMessage[]
}

/**
 * "Quote-and-ask" encoding (ChatPDF/Claude pattern). A quoted passage is prepended to the question
 * as a markdown-style blockquote (`> ` per line) so the SERVER contract stays plain `question:
 * string` — no schema change, and persisted history round-trips the card via {@link parseQuotedContent}.
 */
export function composeQuotedQuestion(passage: string, question: string): string {
  const quoted = passage
    .split('\n')
    .map(line => (line ? `> ${line}` : '>'))
    .join('\n')
  return `${quoted}\n\n${question}`
}

/**
 * Inverse of {@link composeQuotedQuestion}: splits a user message into its leading blockquote
 * (rendered as a styled quote card) and the remaining question text. Returns `quote: null` when the
 * message has no leading `>` block.
 */
export function parseQuotedContent(content: string): { quote: string | null; text: string } {
  if (!content.startsWith('>')) return { quote: null, text: content }
  const lines = content.split('\n')
  const quoteLines: string[] = []
  let i = 0
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('> ')) quoteLines.push(line.slice(2))
    else if (line === '>') quoteLines.push('')
    else break
  }
  if (i < lines.length && lines[i] === '') i++ // drop the single blank separator
  return { quote: quoteLines.join('\n'), text: lines.slice(i).join('\n') }
}

/** Query fragment selecting the catalog edition vs the user-uploaded book. */
function targetQuery(target: AskTarget): string {
  return target.kind === 'userbook' ? `userBookId=${target.id}` : `editionId=${target.id}`
}

/**
 * Loads (auto-creating) the persistent conversation for a book. Cookie auth via {@link authFetch};
 * throws `ApiError` (401 → the caller degrades to the sign-in prompt) on failure.
 */
export function getBookChat(target: AskTarget, signal?: AbortSignal): Promise<BookChatConversation> {
  return authFetch<BookChatConversation>(`/me/chat?${targetQuery(target)}`, { method: 'GET', signal })
}

/**
 * Streams an answer for a new question in an existing conversation. Identical SSE wire format to
 * {@link askStream} — the server persists BOTH turns, so the client sends NO history. Throws
 * `SseUnauthorizedError`/`SseUnsupportedError` from `postSse` for the caller (sign-in / JSON fallback).
 */
export function sendChatMessage(
  conversationId: string,
  question: string,
  currentChapterId: string | undefined,
  { onDelta, onDone, onError, signal }: AskStreamCallbacks,
): Promise<void> {
  const url = `${API_BASE}/me/chat/${conversationId}/messages`
  const body = { question, ...(currentChapterId ? { currentChapterId } : {}) }
  return postSse(url, body, makeAskSseHandler({ onDelta, onDone, onError, signal }), signal)
}

/**
 * Non-streaming fallback for {@link sendChatMessage} (environments with no `ReadableStream` body).
 * Same endpoint, plain JSON response identical to the classic ask fallback.
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
