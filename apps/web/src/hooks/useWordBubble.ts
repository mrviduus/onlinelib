import { useCallback, useEffect, useRef, useState } from 'react'
import { useBubbleTranslationSync } from './useBubbleTranslationSync'
import type { useReaderVocabulary } from './useReaderVocabulary'
import type { useDictionary } from './useDictionary'
import { promoteLookup, updateWord } from '../api/vocabulary'
import { extractSentence } from '../lib/sentenceExtractor'
import { fetchWordBubble } from '../lib/wordBubbleFetch'
import { extractWordFromRange, tokenizeVocabWords } from '../lib/vocabKey'

// Stabilization delay before opening popup. Filters out transient single-word
// selections fired by iOS tap-to-select / scroll-jitter / incidental taps.
const STABILIZE_MS = 220

interface Bubble {
  word: string
  translation: string | null
  translationLoading: boolean
  phonetic: string | undefined
  definition: string | null
  definitionLoading: boolean
  rect: DOMRect | null
  range: Range | null
}

interface LookupState {
  word: string
  id: string
  kind: 'lookup' | 'lookup_pending'
  tapsRemaining: number | null
}

type ReaderVocab = ReturnType<typeof useReaderVocabulary>

interface SelectionLike {
  text: string
  rect: DOMRect | null
  range: Range | null
}

interface Params {
  containerRef: React.RefObject<HTMLElement | null>
  editionId: string
  chapterId: string
  userBookId?: string
  bookLanguage: string
  bookTitle?: string
  targetLang: string | null
  nativeLanguage: string
  hasConfirmedLanguage: boolean
  vocab: ReaderVocab
  lookupWord: ReturnType<typeof useDictionary>['lookup']
  selection: SelectionLike
  hasSelection: boolean
  isSingleWord: boolean
  clearSelection: () => void
  onPendingToast: (msg: string) => void
  t: (key: string) => string
}

export interface UseWordBubbleResult {
  bubble: Bubble | null
  lookupState: LookupState | null
  addAnywayBusy: boolean
  savingWord: string | null
  closeBubble: () => void
  handleAddAnyway: () => void
  clearAutoSave: (word: string) => void
}

export function useWordBubble({
  containerRef,
  editionId,
  chapterId,
  userBookId,
  bookLanguage,
  bookTitle,
  targetLang,
  nativeLanguage,
  hasConfirmedLanguage,
  vocab,
  lookupWord,
  selection,
  hasSelection,
  isSingleWord,
  clearSelection,
  onPendingToast,
  t,
}: Params): UseWordBubbleResult {
  const { vocabMap, addWord, updateTranslation, recordSavedWord } = vocab

  const [bubble, setBubble] = useState<Bubble | null>(null)
  const [lookupState, setLookupState] = useState<LookupState | null>(null)
  const [addAnywayBusy, setAddAnywayBusy] = useState(false)
  // Word for which the auto-save POST is still in flight. WordPopup uses this
  // to suspend its 3-8s auto-dismiss until the save resolves — otherwise a slow
  // server response can close the popup before a lookup result arrives, and
  // the user never sees RareWordNotice.
  const [savingWord, setSavingWord] = useState<string | null>(null)

  const bubbleAbortRef = useRef<AbortController | null>(null)
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { triggerAutoSave, clearAutoSave } = useBubbleTranslationSync({
    bubble,
    setBubble,
    vocabMap,
    updateTranslation,
    targetLang,
    bookLanguage,
    abortRef: bubbleAbortRef,
  })

  const closeBubble = useCallback(() => {
    if (openTimerRef.current) { clearTimeout(openTimerRef.current); openTimerRef.current = null }
    bubbleAbortRef.current?.abort()
    setBubble(null)
    setLookupState(null)
    // Clear selection to break the effect loop: without this, selection persists,
    // isSingleWord stays true, bubble is null → effect re-fires → мерцание.
    clearSelection()
  }, [clearSelection])

  const handleSave = useCallback(async (word: string, range: Range | null) => {
    // Gate: never save vocab with an unconfirmed native. A guessed
    // `navigator.language` isn't a real user choice — persisting it poisons the
    // SRS enrichment pipeline (explanations generated in wrong language) and
    // can't be retroactively fixed once LLM fields are cached.
    if (!hasConfirmedLanguage) {
      throw new Error('native_language_not_confirmed')
    }
    const container = containerRef.current
    const sentence = range && container ? extractSentence(range, container) : undefined
    const currentTranslation = bubble?.word === word ? bubble?.translation : null
    setSavingWord(word)
    let resp: Awaited<ReturnType<typeof addWord>> | null = null
    try {
      resp = await addWord({
        word,
        language: bookLanguage,
        editionId: userBookId ? undefined : (editionId || undefined),
        chapterId: userBookId ? undefined : (chapterId || undefined),
        userBookId: userBookId || undefined,
        sentence: sentence || undefined,
        bookTitle: bookTitle || undefined,
        nativeLanguage,
        translation: currentTranslation || null,
      }).catch(() => null)
    } finally {
      setSavingWord((prev) => (prev === word ? null : prev))
    }
    if (resp?.outcome === 'pending') {
      onPendingToast(t('reader.vocab.queuedForTomorrow'))
    } else if (resp?.outcome === 'lookup' || resp?.outcome === 'lookup_pending') {
      if (resp.lookupId) {
        setLookupState({
          word,
          id: resp.lookupId,
          kind: resp.outcome,
          tapsRemaining: resp.tapsRemaining ?? null,
        })
      }
    }
    const saved = resp?.word
    if (saved?.id && currentTranslation) {
      updateWord(saved.id, { translation: currentTranslation }).catch(() => {})
      updateTranslation(word, currentTranslation)
    }
  }, [
    addWord, bookLanguage, bookTitle, chapterId, containerRef,
    editionId, nativeLanguage, hasConfirmedLanguage, userBookId, updateTranslation,
    bubble?.word, bubble?.translation, onPendingToast, t,
  ])

  const openBubble = useCallback((word: string, rect: DOMRect, range: Range | null) => {
    bubbleAbortRef.current?.abort()
    const ctrl = new AbortController()
    bubbleAbortRef.current = ctrl
    setLookupState(null)
    setBubble({
      word,
      translation: null,
      translationLoading: !!targetLang,
      phonetic: undefined,
      definition: null,
      definitionLoading: true,
      rect,
      range,
    })
    fetchWordBubble({
      word, bookLanguage, targetLang,
      lookup: lookupWord, vocabMap, updateTranslation,
      signal: ctrl.signal,
      patch: (fields) => setBubble((prev) => (prev && prev.word === word ? { ...prev, ...fields } : prev)),
    })

    if (hasConfirmedLanguage) {
      triggerAutoSave(word, () => handleSave(word, range))
    }
  }, [
    bookLanguage, targetLang, vocabMap, updateTranslation, lookupWord,
    handleSave, triggerAutoSave, hasConfirmedLanguage,
  ])

  // Catch-up auto-save: if the user taps a word BEFORE confirming native
  // language, openBubble opens the popup but skips the save. When they then
  // pick a language via the popup's picker, `hasConfirmedLanguage` flips true
  // while the same bubble is still on screen — fire the save now so they
  // don't have to re-tap.
  const prevConfirmedRef = useRef(hasConfirmedLanguage)
  useEffect(() => {
    if (!prevConfirmedRef.current && hasConfirmedLanguage && bubble) {
      triggerAutoSave(bubble.word, () => handleSave(bubble.word, bubble.range))
    }
    prevConfirmedRef.current = hasConfirmedLanguage
  }, [hasConfirmedLanguage, bubble, triggerAutoSave, handleSave])

  // Trigger popup when selection narrows to 1 word — with a short stabilization
  // window so transient selections (iOS auto-select, scroll-tap jitter) don't
  // flash the popup.
  useEffect(() => {
    if (!isSingleWord || !selection.rect || !selection.text) {
      if (openTimerRef.current) { clearTimeout(openTimerRef.current); openTimerRef.current = null }
      // Drop bubble ONLY when selection grew to multi-word (toolbar takes over).
      // Empty selection must NOT close the popup: clicking a button inside the
      // popup natively clears the document selection — we'd kill our own popup.
      if (hasSelection && !isSingleWord) {
        bubbleAbortRef.current?.abort()
        setBubble(null)
      }
      return
    }
    // Prefer DOM-aware extraction (strips .vocab-inline-translation text that
    // Selection API concatenates with the word when both are in the same <mark>).
    // Fallback to tokenizer on raw text to strip NBSP / zero-width chars.
    const word = extractWordFromRange(selection.range)
      ?? tokenizeVocabWords(selection.text)[0]?.word
      ?? selection.text.trim()
    if (!word) return
    if (bubble?.word === word) return

    if (openTimerRef.current) clearTimeout(openTimerRef.current)
    const rect = selection.rect
    const range = selection.range
    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null
      openBubble(word, rect, range)
    }, STABILIZE_MS)
    return () => {
      if (openTimerRef.current) { clearTimeout(openTimerRef.current); openTimerRef.current = null }
    }
  }, [isSingleWord, hasSelection, selection.text, selection.rect, selection.range, bubble?.word, openBubble])

  // Clean abort + pending open timer on unmount.
  useEffect(() => () => {
    bubbleAbortRef.current?.abort()
    if (openTimerRef.current) clearTimeout(openTimerRef.current)
  }, [])

  // "Add anyway" on RareWordNotice: bypasses the frequency filter by promoting
  // the WordLookup row server-side into a full VocabularyWord.
  const handleAddAnyway = useCallback(async () => {
    if (!lookupState || addAnywayBusy) return
    setAddAnywayBusy(true)
    try {
      const saved = await promoteLookup(lookupState.id)
      recordSavedWord(saved)
      setLookupState(null)
      onPendingToast(t('reader.vocab.addedToSrs'))
      closeBubble()
    } catch {
      onPendingToast(t('reader.vocab.addAnywayFailed'))
    } finally {
      setAddAnywayBusy(false)
    }
  }, [lookupState, addAnywayBusy, onPendingToast, t, closeBubble, recordSavedWord])

  return {
    bubble,
    lookupState,
    addAnywayBusy,
    savingWord,
    closeBubble,
    handleAddAnyway,
    clearAutoSave,
  }
}
