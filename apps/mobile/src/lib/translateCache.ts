import { translationApi } from '@textstack/shared'

export type SaveCategory = 'common' | 'learnable' | 'rare'
export type CachedTranslation = { translation: string; category?: SaveCategory }

// In-memory translation cache shared by the reader's selection toolbar, the
// vocab save path, and the gloss backfill. Wins:
//   1. Re-tapping a word is instant (no network round-trip).
//   2. De-dupes the double translate per tap.
//   3. Carries the backend's single-word frequency "category" so the toolbar
//      can recommend (not gate) saving.
// Session-scoped; the backend file cache covers cross-session reuse.
const cache = new Map<string, CachedTranslation>()

const keyOf = (text: string, from: string, to: string) =>
  `${from}|${to}|${text.trim().toLowerCase()}`

/** Synchronous peek — lets the toolbar render instantly on a cache hit. */
export function peekTranslation(text: string, from: string, to: string): CachedTranslation | undefined {
  return cache.get(keyOf(text, from, to))
}

/** Cached translate. On miss, hits the API once and memoizes a non-empty result. */
export async function cachedTranslate(text: string, from: string, to: string): Promise<CachedTranslation> {
  const k = keyOf(text, from, to)
  const hit = cache.get(k)
  if (hit !== undefined) return hit
  const res = await translationApi.translate(text, from, to) as { translatedText?: string; translation?: string; category?: SaveCategory }
  const out: CachedTranslation = { translation: res.translatedText || res.translation || '', category: res.category }
  if (out.translation) cache.set(k, out)
  return out
}
