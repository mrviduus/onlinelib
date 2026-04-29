import { useCallback, MutableRefObject } from 'react'
import { vocabularyApi, translationApi, t } from '@textstack/shared'
import type { Chapter, VocabularyWordDto, Language } from '@textstack/shared'
import { trackVocabSaved, trackTranslationUsed } from '../lib/analytics'
import type { VocabMap } from './useReaderVocabMap'

type ToastFn = (t: { message: string; variant: 'error' | 'success' | 'info' }) => void
type Selection = { text: string; sentence: string; anchor?: any; selectionId: number }
type LookupState = { kind: 'lookup' | 'lookup_pending'; id: string; tapsRemaining: number | null; busy: boolean }

type Options = {
  vocabMapRef: MutableRefObject<VocabMap>
  bookTitleRef: MutableRefObject<string | null>
  editionIdRef: MutableRefObject<string | null>
  chapter: Chapter | null
  language: Language
  nativeLanguage: string
  isAuthenticated: boolean
  injectJs: (js: string) => void
  notifyWordSaved: () => void
  setSessionWordCount: React.Dispatch<React.SetStateAction<number>>
  setWordSaved: (saved: boolean) => void
  setSelection: (s: null) => void
  setLookupState: (s: LookupState | null) => void
  showToast: ToastFn
}

/**
 * Manual vocab actions invoked from the WordCard / SelectionActionBar:
 * Save (manual button), Add-anyway (rare-word notice), Mark known, Remove.
 *
 * The auto-save path inside `handleMessage` still lives in the reader
 * screen — it shares state plumbing with selection lifecycle that's hard
 * to lift cleanly. This hook covers the four user-initiated handlers.
 */
export function useReaderVocabActions({
  vocabMapRef,
  bookTitleRef,
  editionIdRef,
  chapter,
  language,
  nativeLanguage,
  isAuthenticated,
  injectJs,
  notifyWordSaved,
  setSessionWordCount,
  setWordSaved,
  setSelection,
  setLookupState,
  showToast,
}: Options) {
  /** Shared post-save sequence: mark + count + notify + persist translation. */
  const onWordSaved = useCallback((saved: VocabularyWordDto, sourceText: string) => {
    const key = saved.word.toLowerCase()
    vocabMapRef.current[key] = { stage: saved.stage, id: saved.id }
    injectJs(`addVocabWord(${JSON.stringify(key)}, ${saved.stage})`)
    setWordSaved(true)
    setSessionWordCount(c => c + 1)
    notifyWordSaved()
    trackVocabSaved({ language, nativeLanguage, source: 'reader' })

    const targetLang = nativeLanguage !== language ? nativeLanguage : 'en'
    trackTranslationUsed({ fromLang: language, toLang: targetLang, kind: 'word' })
    translationApi.translate(sourceText, language, targetLang)
      .then(res => {
        if (res.translatedText && saved.id) {
          vocabularyApi.updateWord(saved.id, { translation: res.translatedText }).catch(() => {})
          vocabMapRef.current[key] = { ...vocabMapRef.current[key], translation: res.translatedText }
          // Push full map so the inline-translation span renders above the underline.
          // addVocabWord alone only carries {stage}, wiping any prior translation.
          injectJs(`markVocabWords(${JSON.stringify(vocabMapRef.current)})`)
        }
      })
      .catch(() => {})
  }, [vocabMapRef, injectJs, setWordSaved, setSessionWordCount, notifyWordSaved, language, nativeLanguage])

  const saveWord = useCallback(async (selection: Selection) => {
    if (!isAuthenticated) return
    try {
      const resp = await vocabularyApi.saveWord({
        word: selection.text,
        language,
        sentence: selection.sentence || null,
        bookTitle: bookTitleRef.current || null,
        editionId: editionIdRef.current || null,
        chapterId: chapter?.id || null,
      })
      if (resp.outcome === 'pending') {
        showToast({ message: t(language, 'reader.vocab.queuedForTomorrow'), variant: 'info' })
        return
      }
      if (resp.outcome === 'lookup' || resp.outcome === 'lookup_pending') {
        if (resp.lookupId) {
          setLookupState({ kind: resp.outcome, id: resp.lookupId, tapsRemaining: resp.tapsRemaining, busy: false })
        }
        return
      }
      if (resp.outcome === 'already_saved') return
      const saved = resp.word
      if (!saved) return
      onWordSaved(saved, selection.text)
    } catch (e) {
      console.warn('Save word failed:', e)
      showToast({ message: 'Could not save word. Try again.', variant: 'error' })
    }
  }, [isAuthenticated, language, bookTitleRef, editionIdRef, chapter, showToast, setLookupState, onWordSaved])

  /**
   * F1 anti-spiral: "Add to SRS anyway" on a rare-word notice.
   * Promotes WordLookup → VocabularyWord (bypasses daily cap) and mirrors
   * the post-save flow so the word gets underlined + translated.
   */
  const promoteLookup = useCallback(async (lookup: LookupState) => {
    setLookupState({ ...lookup, busy: true })
    try {
      const saved = await vocabularyApi.promoteLookup(lookup.id)
      setLookupState(null)
      onWordSaved(saved, saved.word)
      showToast({ message: t(language, 'reader.vocab.addedToSrs'), variant: 'success' })
    } catch (e) {
      console.warn('Promote lookup failed:', e)
      setLookupState({ ...lookup, busy: false })
      showToast({ message: t(language, 'reader.vocab.addAnywayFailed'), variant: 'error' })
    }
  }, [setLookupState, onWordSaved, showToast, language])

  const markKnown = useCallback(async (selection: Selection) => {
    if (!isAuthenticated) return
    const key = selection.text.toLowerCase()
    const entry = vocabMapRef.current[key]
    if (!entry) return
    try {
      await vocabularyApi.markAsKnown(entry.id)
      vocabMapRef.current[key] = { ...entry, stage: 4 }
      injectJs(`addVocabWord(${JSON.stringify(key)}, 4)`)
      setSelection(null)
    } catch (e) {
      console.warn('Mark as known failed:', e)
      showToast({ message: 'Could not mark as known. Try again.', variant: 'error' })
    }
  }, [isAuthenticated, vocabMapRef, injectJs, setSelection, showToast])

  /**
   * B-79 web-parity: optimistic remove. We drop the word locally and re-mark
   * the WebView map immediately. On network failure the snapshot is restored.
   * markVocabWords re-renders from scratch — no dedicated removeVocabWord.
   */
  const removeWord = useCallback(async (selection: Selection) => {
    if (!isAuthenticated) return
    const key = selection.text.toLowerCase()
    const entry = vocabMapRef.current[key]
    if (!entry) return
    const snapshot = { ...entry }
    delete vocabMapRef.current[key]
    injectJs(`markVocabWords(${JSON.stringify(vocabMapRef.current)})`)
    setWordSaved(false)
    try {
      await vocabularyApi.deleteWord(entry.id)
      setSelection(null)
    } catch (e) {
      console.warn('Remove word failed:', e)
      vocabMapRef.current[key] = snapshot
      injectJs(`markVocabWords(${JSON.stringify(vocabMapRef.current)})`)
      setWordSaved(true)
      showToast({ message: 'Could not remove word. Try again.', variant: 'error' })
    }
  }, [isAuthenticated, vocabMapRef, injectJs, setWordSaved, setSelection, showToast])

  return { saveWord, promoteLookup, markKnown, removeWord }
}
