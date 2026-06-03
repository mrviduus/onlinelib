import { translationApi } from '@textstack/shared'

// In-memory translation cache shared by the reader's selection toolbar and the
// vocab auto-save path. Two wins:
//   1. Re-tapping a word is instant (no network round-trip).
//   2. De-dupes the double translate per tap — the toolbar fetches the gloss,
//      then auto-save reuses the same cached result instead of a 2nd call.
// Session-scoped (cleared on app restart); the backend file cache covers
// cross-session reuse.
const cache = new Map<string, string>()

const keyOf = (text: string, from: string, to: string) =>
  `${from}|${to}|${text.trim().toLowerCase()}`

/** Synchronous peek — lets the toolbar render instantly on a cache hit
 *  (no spinner) instead of awaiting a resolved promise. */
export function peekTranslation(text: string, from: string, to: string): string | undefined {
  return cache.get(keyOf(text, from, to))
}

/** Cached translate. On miss, hits the API once and memoizes a non-empty
 *  result. Concurrent callers for the same key each fetch, but the backend
 *  file cache absorbs that — the win here is re-taps + cross-call de-dupe. */
export async function cachedTranslate(text: string, from: string, to: string): Promise<string> {
  const k = keyOf(text, from, to)
  const hit = cache.get(k)
  if (hit !== undefined) return hit
  const res = await translationApi.translate(text, from, to) as { translatedText?: string; translation?: string }
  const t = res.translatedText || res.translation || ''
  if (t) cache.set(k, t)
  return t
}
