import { useEffect, useRef } from 'react'
import { vocabularyApi } from '@textstack/shared'
import { vocabMapCache } from '../lib/readerOfflineCache'

export type VocabMapEntry = { stage: number; id: string; translation?: string }
export type VocabMap = Record<string, VocabMapEntry>

type User = { id: string } | null | undefined

type Options = {
  user: User
  isAuthenticated: boolean
  chapterId: string | null | undefined
  injectJs: (js: string) => void
}

/**
 * Owns the per-user vocab-map ref + cache-first load.
 * Save/remove handlers in the reader screen still mutate `vocabMapRef.current`
 * directly — this hook only loads + paints; it doesn't intercept writes.
 */
export function useReaderVocabMap({ user, isAuthenticated, chapterId, injectJs }: Options) {
  const vocabMapRef = useRef<VocabMap>({})

  // Load + paint vocab underlines. Cache-first so offline nav still shows
  // marks; API refresh overwrites. Keyed off chapterId (not chapter object)
  // so a refetch with the same id doesn't re-trigger.
  useEffect(() => {
    if (!isAuthenticated || !chapterId) return
    let cancelled = false

    const uid = user?.id
    if (uid) {
      vocabMapCache.get(uid).then(cached => {
        if (!cancelled && cached && Object.keys(cached).length > 0) {
          vocabMapRef.current = cached
          injectJs(`markVocabWords(${JSON.stringify(cached)})`)
        }
      })
    }

    vocabularyApi.getReaderVocab()
      .then(words => {
        if (cancelled || words.length === 0) return
        const map: VocabMap = {}
        for (const w of words) map[w.word.toLowerCase()] = { stage: w.stage, id: w.id, translation: w.translation }
        vocabMapRef.current = map
        injectJs(`markVocabWords(${JSON.stringify(map)})`)
        if (uid) vocabMapCache.set(uid, map)
      })
      .catch(() => { /* offline — cache paint already rendered */ })
    return () => { cancelled = true }
  }, [isAuthenticated, chapterId, user?.id, injectJs])

  /** Persist current map to per-user cache. Caller invokes when a selection closes. */
  const flushToCache = () => {
    const uid = user?.id
    if (uid && Object.keys(vocabMapRef.current).length > 0) {
      vocabMapCache.set(uid, vocabMapRef.current)
    }
  }

  return { vocabMapRef, flushToCache }
}
