import { fetch as expoFetch } from 'expo/fetch'
import {
  createSseParser,
  SseUnauthorizedError,
  SseUnsupportedError,
  type SseEvent,
} from './sseParser'

// SSE-over-POST for mobile. React Native's built-in `fetch` buffers the whole body (no streaming),
// so we use `expo/fetch` (Expo SDK 52+ WinterCG fetch) which exposes `response.body` as a real
// ReadableStream. Same POST-with-body pattern the web reader uses (EventSource can't POST) and the
// same minimal parser (./sseParser) — the wire format is byte-identical to the legacy `/ask` stream.
//
// Auth is Bearer (mobile has no cookies): the caller passes the access token; a 401 surfaces as
// `SseUnauthorizedError` so the caller can refresh + retry (see bookChat.sendChatMessage).

export { SseUnauthorizedError, SseUnsupportedError } from './sseParser'

/**
 * POSTs JSON and consumes the SSE response, invoking `onEvent` per event. Maps non-OK statuses to
 * readable errors BEFORE streaming (rate-limit/unavailable responses are JSON, not SSE). Throws
 * `SseUnsupportedError` when the body can't be streamed so the caller can fall back to a plain POST.
 */
export async function postSse(
  url: string,
  token: string | null,
  body: unknown,
  onEvent: (e: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await expoFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    if (res.status === 401) throw new SseUnauthorizedError()
    if (res.status === 503) throw new Error('Service unavailable')
    if (res.status === 504) throw new Error('Request timed out')
    if (res.status === 429) throw new Error('Too many requests, try again later')
    const text = await res.text().catch(() => '')
    let error = `Request failed: ${res.status}`
    try {
      const json = JSON.parse(text)
      if (json?.detail) error = json.detail
      else if (json?.error) error = json.error
    } catch {
      // non-JSON error body — keep the status message
    }
    throw new Error(error)
  }

  if (!res.body) throw new SseUnsupportedError()

  const parser = createSseParser(onEvent)
  // Guard the stream setup itself: an OK response whose body isn't a spec ReadableStream (no
  // `getReader`), or a runtime with no `TextDecoder` global, can't be streamed. Rethrow as
  // `SseUnsupportedError` so the caller degrades to `sendChatMessageJson` instead of dead-ending
  // on a raw TypeError banner. (A failure DURING the read below is a genuine stream error, not this.)
  let reader: ReadableStreamDefaultReader<Uint8Array>
  let decoder: TextDecoder
  try {
    reader = res.body.getReader()
    decoder = new TextDecoder()
  } catch {
    throw new SseUnsupportedError()
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) parser.feed(decoder.decode(value, { stream: true }))
    }
    parser.feed(decoder.decode()) // flush any trailing multi-byte sequence
    parser.end()
  } finally {
    reader.releaseLock()
  }
}
