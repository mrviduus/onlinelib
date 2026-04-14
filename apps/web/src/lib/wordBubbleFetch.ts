// Shared "open word popup" data pipeline used by ReaderHighlights + FocusReaderPage:
//   1. Dictionary lookup → phonetic + definition
//   2. Translation fetch → target-lang text
//   3. Propagate fresh translation into vocab map + backend (for already-saved words)
//
// Caller owns bubble state + abort controller; we kick off the async fetches and
// merge results via `patch`, which the caller guards against a stale bubble word.

import type { DictionaryEntry } from '../api/dictionary'
import { translate as translateApi } from '../api/translation'
import { updateWord } from '../api/vocabulary'
import type { VocabMap } from '../hooks/useReaderVocabulary'
import { normalizeVocabKey } from './vocabKey'

/** Subset of bubble fields the fetcher touches — caller extends their full state. */
export interface WordBubbleFetchFields {
  phonetic?: string | undefined
  definition?: string | null
  definitionLoading?: boolean
  translation?: string | null
  translationLoading?: boolean
}

interface FetchWordBubbleOpts {
  word: string
  bookLanguage: string
  targetLang: string | null
  lookup: (word: string, lang: string) => Promise<DictionaryEntry | null>
  vocabMap: VocabMap
  updateTranslation: (word: string, translation: string) => void
  signal: AbortSignal
  /** Merge a partial update into the active bubble if it's still the same word.
   *  Caller implements the stale-word guard using their bubble state. */
  patch: (fields: WordBubbleFetchFields) => void
}

export function fetchWordBubble(opts: FetchWordBubbleOpts) {
  const {
    word, bookLanguage, targetLang,
    lookup, vocabMap, updateTranslation,
    signal, patch,
  } = opts

  // Dictionary (phonetic + definition) — runs regardless of targetLang.
  lookup(word, bookLanguage)
    .then((entry) => {
      if (signal.aborted) return
      patch({
        phonetic: entry?.phonetic,
        definition: entry?.definitions?.[0]?.definitions?.[0]?.definition ?? null,
        definitionLoading: false,
      })
    })
    .catch(() => {
      if (signal.aborted) return
      patch({ definitionLoading: false })
    })

  // Translation fetch (no save). Skipped in same-lang definition mode.
  if (!targetLang) return
  translateApi(word, bookLanguage, targetLang, signal)
    .then((res) => {
      if (signal.aborted) return
      const translatedText = res?.translatedText ?? null
      patch({ translation: translatedText, translationLoading: false })
      // If word already saved (e.g. user re-tapping underlined word), propagate
      // translation to vocab map so inline caption stays fresh.
      if (translatedText) {
        const existing = vocabMap.get(normalizeVocabKey(word))
        if (existing?.id && !existing.isPending && !existing.translation) {
          updateWord(existing.id, { translation: translatedText }).catch(() => {})
        }
        if (existing) updateTranslation(word, translatedText)
      }
    })
    .catch((err) => {
      if (signal.aborted) return
      if ((err as { name?: string })?.name === 'AbortError') return
      patch({ translationLoading: false })
    })
}
