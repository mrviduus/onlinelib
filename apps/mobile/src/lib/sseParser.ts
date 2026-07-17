// Pure SSE parsing for the mobile chat/ask streams. Kept RN-free (no expo/fetch import) so it's
// unit-testable under Vitest (see sseParser.test.ts). The network layer that actually opens the
// stream lives in ./sse — it imports `createSseParser` from here. Wire format is identical to the
// web reader's parser (apps/web/src/lib/sse.ts): `event:`/`data:` fields, blank-line dispatch,
// multi-line data joined with \n, comment lines (`:`) ignored, CRLF-tolerant.

export interface SseEvent {
  event: string
  data: string
}

/** Terminal `done` payload of a streamed ask (same shape the legacy `/ask` `done` frame carries). */
export interface AskDone {
  citations: import('@textstack/shared').AskCitation[]
  lastReadOrd: number
  insufficient: boolean
}

export interface AskStreamCallbacks {
  onDelta: (fragment: string) => void
  onDone: (done: AskDone) => void
  onError: (message: string) => void
  signal?: AbortSignal
}

/** The SSE request was rejected with 401 — the caller should refresh the token / prompt sign-in. */
export class SseUnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'SseUnauthorizedError'
  }
}

/** The environment can't stream (no response body reader) — caller falls back to a plain JSON POST. */
export class SseUnsupportedError extends Error {
  constructor() {
    super('Streaming not supported')
    this.name = 'SseUnsupportedError'
  }
}

/**
 * Stateful SSE parser: feed it raw text chunks (any split points), it dispatches complete events.
 * Subset of the SSE spec sufficient for our endpoints. Call `end()` to flush a trailing event from
 * a stream that closed without a final blank line.
 */
export function createSseParser(onEvent: (e: SseEvent) => void) {
  let buffer = ''
  let eventType = 'message'
  let dataLines: string[] = []

  const dispatch = () => {
    if (dataLines.length > 0) onEvent({ event: eventType, data: dataLines.join('\n') })
    eventType = 'message'
    dataLines = []
  }

  const processLine = (line: string) => {
    if (line === '') return dispatch()
    if (line.startsWith(':')) return // comment / keep-alive
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    // Per spec a single space after the colon is stripped, further spaces are data.
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') eventType = value
    else if (field === 'data') dataLines.push(value)
    // id/retry/unknown fields ignored
  }

  return {
    feed(chunk: string) {
      buffer += chunk
      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, nl)
        if (line.endsWith('\r')) line = line.slice(0, -1)
        buffer = buffer.slice(nl + 1)
        processLine(line)
      }
    },
    end() {
      if (buffer.length > 0) processLine(buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer)
      buffer = ''
      dispatch()
    },
  }
}

/**
 * Parses a `done` frame's JSON data into the terminal payload, defaulting every field so a malformed
 * frame never throws. Mirrors web's `makeAskSseHandler` done-branch.
 */
export function parseAskDone(data: string): AskDone {
  try {
    const parsed = JSON.parse(data) as Partial<AskDone>
    return {
      citations: parsed.citations ?? [],
      lastReadOrd: parsed.lastReadOrd ?? 0,
      insufficient: Boolean(parsed.insufficient),
    }
  } catch {
    return { citations: [], lastReadOrd: 0, insufficient: false }
  }
}

/**
 * Builds the per-event handler for an ask-style SSE stream (`delta` → text fragment, `done` →
 * citations/insufficient JSON, `error` → message). Single-sourced so the persistent book-chat parses
 * the identical wire format as the legacy ask. Respects `signal` so aborted streams stop dispatching.
 */
export function makeAskSseHandler({ onDelta, onDone, onError, signal }: AskStreamCallbacks) {
  return (e: SseEvent) => {
    if (signal?.aborted) return
    if (e.event === 'delta') onDelta(e.data)
    else if (e.event === 'done') onDone(parseAskDone(e.data))
    else if (e.event === 'error') onError(e.data || 'Ask failed')
  }
}
