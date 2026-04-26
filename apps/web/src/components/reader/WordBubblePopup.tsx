import { type RefObject } from 'react'
import { WordPopup } from './WordPopup'
import { normalizeVocabKey } from '../../lib/vocabKey'
import type { VocabMap } from '../../hooks/useReaderVocabulary'

interface Bubble {
  word: string
  translation: string | null
  translationLoading: boolean
  phonetic: string | undefined
  definition: string | null
  definitionLoading: boolean
  rect: DOMRect | null
}

interface LookupState {
  word: string
  kind: 'lookup' | 'lookup_pending'
  tapsRemaining: number | null
}

interface Props {
  bubble: Bubble
  containerRef: RefObject<HTMLElement | null>
  vocabMap: VocabMap
  lookupState: LookupState | null
  addAnywayBusy: boolean
  savingWord: string | null
  nativeLanguage: string
  hasConfirmedLanguage: boolean
  bookLanguage: string
  onSpeak: (text: string) => void
  onRemove: (id: string, word: string) => void
  onClose: () => void
  onChangeNativeLanguage: (lang: string) => void
  onAddAnyway: () => void
  t: (key: string) => string
}

export function WordBubblePopup({
  bubble,
  containerRef,
  vocabMap,
  lookupState,
  addAnywayBusy,
  savingWord,
  nativeLanguage,
  hasConfirmedLanguage,
  bookLanguage,
  onSpeak,
  onRemove,
  onClose,
  onChangeNativeLanguage,
  onAddAnyway,
  t,
}: Props) {
  const entry = vocabMap.get(normalizeVocabKey(bubble.word))
  const isSaved = !!entry
  const lookupForBubble = lookupState && lookupState.word === bubble.word ? lookupState : null

  return (
    <WordPopup
      word={bubble.word}
      phonetic={bubble.phonetic}
      translation={bubble.translation}
      translationLoading={bubble.translationLoading}
      definition={bubble.definition}
      definitionLoading={bubble.definitionLoading}
      rect={bubble.rect}
      containerRef={containerRef}
      onSpeak={() => onSpeak(bubble.word)}
      onRemove={entry?.id ? () => onRemove(entry.id!, bubble.word) : undefined}
      onClose={onClose}
      isSaved={isSaved}
      nativeLanguage={nativeLanguage}
      onChangeNativeLanguage={onChangeNativeLanguage}
      hasConfirmedLanguage={hasConfirmedLanguage}
      bookLanguage={bookLanguage}
      t={t}
      lookupInfo={lookupForBubble
        ? { kind: lookupForBubble.kind, tapsRemaining: lookupForBubble.tapsRemaining }
        : null}
      onAddAnyway={lookupForBubble ? onAddAnyway : undefined}
      addAnywayBusy={addAnywayBusy}
      saveInFlight={savingWord === bubble.word}
    />
  )
}
