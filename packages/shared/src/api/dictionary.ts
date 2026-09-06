import { publicFetch } from './client'

export interface DictionaryEntry {
  word: string
  phonetic?: string
  /**
   * The server has always called this `definitions` (`DictionaryResponse.Definitions`).
   * This declared `meanings`, so every mobile consumer read `undefined` and bailed on its
   * own empty-guard — the vocabulary card's dictionary line has never rendered. The web
   * copy at `apps/web/src/api/dictionary.ts` had the name right, which is why only one
   * platform was broken and neither reported it.
   */
  definitions: {
    partOfSpeech: string
    definitions: { definition: string; example?: string }[]
  }[]
  /** True when served from the server cache. */
  cached?: boolean
  /** True when served past its TTL because the upstream was unreachable. */
  stale?: boolean
}

export function lookupWord(lang: string, word: string) {
  return publicFetch<DictionaryEntry>(`/dictionary/${lang}/${encodeURIComponent(word)}`)
}
