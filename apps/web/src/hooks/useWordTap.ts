import { useRef, useCallback, useState, useEffect } from 'react'
import { getWordAtPoint } from '../lib/wordAtPoint'
import { extractSentence } from '../lib/sentenceExtractor'
import { translate as translateWord } from '../api/translation'
import { updateWord } from '../api/vocabulary'
import { useDictionary } from './useDictionary'
import { useReaderVocabulary } from './useReaderVocabulary'

interface TapPopupState {
  word: string | null
  rect: DOMRect | null
  translation: string | null
  translationLoading: boolean
  phonetic: string | undefined
  definition: string | null
  definitionLoading: boolean
}

const INITIAL_TAP: TapPopupState = {
  word: null,
  rect: null,
  translation: null,
  translationLoading: false,
  phonetic: undefined,
  definition: null,
  definitionLoading: false,
}

/** CSS selectors for elements that should not trigger word tap */
const POPUP_SELECTORS = '.word-popup, .selection-toolbar, .dictionary-popup, .translation-popup, .note-editor'

interface UseWordTapOptions {
  wrapperRef: React.RefObject<HTMLElement | null>
  containerRef: React.RefObject<HTMLElement | null>
  bookLanguage: string
  targetLang: string
  isAuthenticated?: boolean
  editionId: string
  chapterId: string
  userBookId?: string
  bookTitle?: string
  clearSelection: () => void
}

export function useWordTap({
  wrapperRef,
  containerRef,
  bookLanguage,
  targetLang,
  isAuthenticated,
  editionId,
  chapterId,
  userBookId,
  bookTitle,
  clearSelection,
}: UseWordTapOptions) {
  const { vocabMap, addWord: addVocabWord, markAsKnown: markVocabKnown, removeWord: removeVocabWord, updateTranslation } = useReaderVocabulary()
  const { lookup: lookupWord } = useDictionary()

  const [tap, setTap] = useState<TapPopupState>(INITIAL_TAP)
  const highlightRef = useRef<HTMLElement | null>(null)
  const mouseDownRef = useRef<{ x: number; y: number; time: number } | null>(null)

  // --- Highlight DOM helpers ---

  const clearHighlight = useCallback(() => {
    const mark = highlightRef.current
    if (mark && mark.isConnected) {
      const parent = mark.parentNode
      if (parent) {
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
        parent.removeChild(mark)
        parent.normalize()
      }
    }
    highlightRef.current = null
  }, [])

  const close = useCallback(() => {
    clearHighlight()
    setTap(INITIAL_TAP)
  }, [clearHighlight])

  // --- Core tap handler ---

  const handleTap = useCallback((clientX: number, clientY: number, target: HTMLElement) => {
    const down = mouseDownRef.current
    mouseDownRef.current = null
    if (!down) return

    // Must be a quick click with minimal movement
    if (Date.now() - down.time > 300) return
    if (Math.abs(clientX - down.x) > 5 || Math.abs(clientY - down.y) > 5) return

    // Don't interfere with existing selection
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return

    const container = containerRef.current
    if (!container || !container.contains(target)) return
    if (target.closest(POPUP_SELECTORS)) return

    const result = getWordAtPoint(clientX, clientY)
    if (!result) return

    // Wrap word in highlight mark
    clearHighlight()
    const mark = document.createElement('mark')
    mark.className = 'word-popup-highlight'
    try {
      result.range.surroundContents(mark)
    } catch {
      close()
      return
    }
    highlightRef.current = mark

    const word = result.word
    const rect = mark.getBoundingClientRect()
    clearSelection()

    // Show popup immediately, load data in parallel
    setTap({ word, rect, translation: null, translationLoading: true, phonetic: undefined, definition: null, definitionLoading: true })

    const translationPromise = translateWord(word, bookLanguage, targetLang)
      .then(res => {
        setTap(prev => ({ ...prev, translation: res.translatedText }))
        return res.translatedText
      })
      .catch(() => null as string | null)
      .finally(() => setTap(prev => ({ ...prev, translationLoading: false })))

    lookupWord(word, bookLanguage)
      .then(entry => {
        if (entry) {
          setTap(prev => ({
            ...prev,
            phonetic: entry.phonetic,
            definition: entry.definitions?.[0]?.definitions?.[0]?.definition || null,
          }))
        }
      })
      .catch(() => {})
      .finally(() => setTap(prev => ({ ...prev, definitionLoading: false })))

    // Auto-save to vocabulary, then patch translation once it resolves
    if (isAuthenticated && !vocabMap.get(word.toLowerCase())) {
      let sentence: string | undefined
      try {
        if (container) sentence = extractSentence(result.range, container)
      } catch {}

      addVocabWord({
        word,
        language: bookLanguage,
        editionId: userBookId ? undefined : editionId || undefined,
        chapterId: userBookId ? undefined : chapterId || undefined,
        userBookId: userBookId || undefined,
        sentence: sentence || undefined,
        bookTitle: bookTitle || undefined,
        nativeLanguage: targetLang || undefined,
      }).then(saved => {
        translationPromise.then(translation => {
          if (translation && saved?.id) {
            updateWord(saved.id, { translation }).catch(() => {})
            updateTranslation(saved.word, translation)
          }
        })
      }).catch(() => {})
    }
  }, [containerRef, clearSelection, clearHighlight, close, bookLanguage, targetLang, lookupWord, isAuthenticated, vocabMap, addVocabWord, editionId, chapterId, userBookId, bookTitle])

  // --- Attach pointer listeners ---

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const onDown = (e: MouseEvent | TouchEvent) => {
      const pt = 'touches' in e ? e.touches[0] : e
      mouseDownRef.current = { x: pt.clientX, y: pt.clientY, time: Date.now() }
    }

    const onUp = (e: MouseEvent | TouchEvent) => {
      const pt = 'changedTouches' in e ? e.changedTouches[0] : e as MouseEvent
      handleTap(pt.clientX, pt.clientY, e.target as HTMLElement)
    }

    wrapper.addEventListener('mousedown', onDown)
    wrapper.addEventListener('mouseup', onUp)
    wrapper.addEventListener('touchstart', onDown, { passive: true })
    wrapper.addEventListener('touchend', onUp)

    return () => {
      wrapper.removeEventListener('mousedown', onDown)
      wrapper.removeEventListener('mouseup', onUp)
      wrapper.removeEventListener('touchstart', onDown)
      wrapper.removeEventListener('touchend', onUp)
    }
  }, [wrapperRef, handleTap])

  // Clean up on unmount
  useEffect(() => () => clearHighlight(), [clearHighlight])

  // --- Vocab actions ---

  const vocabEntry = tap.word ? vocabMap.get(tap.word.toLowerCase()) : undefined

  const markKnown = useCallback(() => {
    if (!tap.word) return
    const entry = vocabMap.get(tap.word.toLowerCase())
    if (entry?.id) markVocabKnown(entry.id, tap.word)
  }, [tap.word, vocabMap, markVocabKnown])

  const remove = useCallback(() => {
    if (!tap.word) return
    const entry = vocabMap.get(tap.word.toLowerCase())
    if (entry?.id) removeVocabWord(entry.id, tap.word)
    close()
  }, [tap.word, vocabMap, removeVocabWord, close])

  return { tap, close, vocabEntry, vocabMap, markKnown, remove, markVocabKnown, removeVocabWord }
}
