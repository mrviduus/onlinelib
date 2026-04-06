import { useRef, useCallback, useState, useEffect } from 'react'
import { useTextSelection } from '../../hooks/useTextSelection'
import { useHighlights } from '../../hooks/useHighlights'
import { useTextTranslation } from '../../hooks/useTextTranslation'
import { useNativeLanguage } from '../../context/NativeLanguageContext'
import { useDictionary } from '../../hooks/useDictionary'
import { useTts } from '../../hooks/useTts'
import { useReaderVocabulary } from '../../hooks/useReaderVocabulary'
import { createTextAnchor, findTextByAnchor } from '../../lib/textAnchor'
import { extractSentence } from '../../lib/sentenceExtractor'
import { saveWord as saveWordApi } from '../../api/vocabulary'
import type { HighlightColor, StoredHighlight } from '../../lib/offlineDb'
import { SelectionToolbar } from './SelectionToolbar'
import { HighlightLayer } from './HighlightLayer'
import { VocabWordLayer } from './VocabWordLayer'
import { TranslationPopup } from './TranslationPopup'
import { DictionaryPopup } from './DictionaryPopup'
import { DictionaryCard } from './DictionaryCard'
import type { AutoSaveState } from './DictionaryCard'
import { NoteEditor } from './NoteEditor'
import { ClickToTranslate } from './ClickToTranslate'

interface ReaderHighlightsProps {
  editionId: string
  chapterId: string
  containerRef: React.RefObject<HTMLElement | null>
  isAuthenticated?: boolean
  bookLanguage?: string
  bookTitle?: string
  userBookId?: string
  ttsSpeed?: number
  autoLookup?: boolean
  scrollToHighlightId?: string | null
  children: React.ReactNode
}

export function ReaderHighlights({
  editionId,
  chapterId,
  containerRef,
  isAuthenticated,
  bookLanguage = 'en',
  bookTitle,
  userBookId,
  ttsSpeed = 1.0,
  autoLookup = true,
  scrollToHighlightId,
  children,
}: ReaderHighlightsProps) {
  const { nativeLanguage } = useNativeLanguage()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { vocabMap, addWord: addVocabWord, markAsKnown: markVocabKnown, removeWord: removeVocabWord } = useReaderVocabulary()
  const [showTranslation, setShowTranslation] = useState(false)
  const [translationText, setTranslationText] = useState('')
  const [translationRect, setTranslationRect] = useState<DOMRect | null>(null)
  const [showDictionary, setShowDictionary] = useState(false)
  const [dictionaryWord, setDictionaryWord] = useState('')
  const [dictionaryRect, setDictionaryRect] = useState<DOMRect | null>(null)
  const [editingHighlight, setEditingHighlight] = useState<StoredHighlight | null>(null)
  const [editingHighlightRect, setEditingHighlightRect] = useState<DOMRect | null>(null)
  const [vocabSaved, setVocabSaved] = useState(false)
  const [vocabToast, setVocabToast] = useState<string | null>(null)
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>('idle')
  const autoSaveRef = useRef('')
  const autoLookupTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Use the container ref for selection detection
  const { selection, clearSelection, hasSelection } = useTextSelection(containerRef)

  // Highlights for current chapter
  const {
    highlights,
    addHighlight,
    updateHighlight,
    removeHighlight,
  } = useHighlights(userBookId ? undefined : editionId, userBookId, {
    chapterId,
    isAuthenticated,
  })

  // Scroll to a specific highlight when navigating from highlights page
  const scrolledToHighlightRef = useRef(false)
  useEffect(() => {
    if (!scrollToHighlightId || scrolledToHighlightRef.current) return
    if (highlights.length === 0 || !containerRef.current) return

    const target = highlights.find(h => h.id === scrollToHighlightId)
    if (!target) return

    scrolledToHighlightRef.current = true

    // Wait for DOM to settle before finding text position
    requestAnimationFrame(() => {
      const container = containerRef.current
      if (!container) return

      const range = findTextByAnchor(target.anchor, container)
      if (!range) return

      const el = range.startContainer.parentElement
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })
  }, [scrollToHighlightId, highlights, containerRef])

  // Translation
  const {
    translatedText,
    isLoading: isTranslating,
    error: translationError,
    translate,
    reset: resetTranslation,
    languages,
    sourceLang,
    targetLang,
    setSourceLang,
    setTargetLang,
  } = useTextTranslation({
    defaultSourceLang: bookLanguage,
    defaultTargetLang: nativeLanguage === bookLanguage ? (bookLanguage === 'uk' ? 'en' : 'uk') : nativeLanguage,
  })

  // TTS
  const { speak } = useTts()
  const handleSpeak = useCallback((text: string, lang?: string) => {
    speak(text, lang || bookLanguage, undefined, ttsSpeed)
  }, [speak, bookLanguage, ttsSpeed])

  // Dictionary
  const {
    entry: dictionaryEntry,
    isLoading: isDictionaryLoading,
    error: dictionaryError,
    lookup: lookupWord,
    reset: resetDictionary,
  } = useDictionary()

  // Helper: check if text is a single word
  const selectedWord = selection.text.trim()
  const isSingleWord = selectedWord.length > 0 && selectedWord.length <= 50 && /^[^\s]+$/.test(selectedWord)

  // Auto-lookup: debounced dictionary fetch on single-word selection
  useEffect(() => {
    if (!autoLookup || !hasSelection || !isSingleWord) return

    clearTimeout(autoLookupTimerRef.current)
    autoLookupTimerRef.current = setTimeout(() => {
      lookupWord(selectedWord, bookLanguage)
    }, 200)

    return () => clearTimeout(autoLookupTimerRef.current)
  }, [autoLookup, hasSelection, isSingleWord, selectedWord, bookLanguage, lookupWord])

  // Auto-save: fire-and-forget after dictionary loads (or errors)
  useEffect(() => {
    if (!autoLookup || !isAuthenticated || !hasSelection || !isSingleWord) return
    if (isDictionaryLoading) return
    if (autoSaveRef.current === selectedWord) return

    // If word is already in vocabulary, skip saving and show as saved immediately
    const existingEntry = vocabMap.get(selectedWord.toLowerCase())
    if (existingEntry) {
      autoSaveRef.current = selectedWord
      setAutoSaveState('saved')
      return
    }

    autoSaveRef.current = selectedWord
    setAutoSaveState('saving')

    const def = dictionaryEntry?.definitions?.[0]?.definitions?.[0]?.definition || undefined
    const sentence = selection.range && containerRef.current
      ? extractSentence(selection.range, containerRef.current)
      : undefined

    addVocabWord({
      word: selectedWord,
      language: bookLanguage,
      definition: def,
      editionId: userBookId ? undefined : editionId || undefined,
      chapterId: userBookId ? undefined : chapterId || undefined,
      userBookId: userBookId || undefined,
      sentence: sentence || undefined,
      bookTitle: bookTitle || undefined,
    })
      .then(() => setAutoSaveState('saved'))
      .catch(() => setAutoSaveState('idle'))
  }, [autoLookup, isAuthenticated, hasSelection, isSingleWord, selectedWord, isDictionaryLoading, dictionaryEntry, selection.range, containerRef, bookLanguage, editionId, chapterId, userBookId, bookTitle, addVocabWord, vocabMap])

  // Reset auto-save state when selection clears
  useEffect(() => {
    if (!hasSelection) {
      autoSaveRef.current = ''
      setAutoSaveState('idle')
      resetDictionary()
    }
  }, [hasSelection, resetDictionary])

  // Expand from DictionaryCard to full DictionaryPopup
  const handleExpandDictionary = useCallback(() => {
    if (!selection.rect) return
    setDictionaryWord(selectedWord)
    setDictionaryRect(selection.rect)
    setShowDictionary(true)
    setVocabSaved(autoSaveState === 'saved')
  }, [selection.rect, selectedWord, autoSaveState])

  const handleHighlight = useCallback(
    async (color: HighlightColor) => {
      if (!selection.range || !containerRef.current) return

      const anchor = createTextAnchor(selection.range, chapterId, containerRef.current)
      await addHighlight(anchor, color, selection.text)
      clearSelection()
      setShowTranslation(false)
    },
    [selection, containerRef, chapterId, addHighlight, clearSelection]
  )

  const handleTranslate = useCallback(() => {
    if (!selection.text || !selection.rect) return

    // Limit to 500 characters
    const textToTranslate = selection.text.slice(0, 500)
    setTranslationText(textToTranslate)
    setTranslationRect(selection.rect)
    setShowTranslation(true)
    translate(textToTranslate)
  }, [selection, translate])

  const handleCloseTranslation = useCallback(() => {
    setShowTranslation(false)
    setTranslationText('')
    setTranslationRect(null)
    resetTranslation()
    clearSelection()
  }, [resetTranslation, clearSelection])

  const handleSourceLangChange = useCallback(
    (lang: string) => {
      setSourceLang(lang)
      if (translationText) {
        translate(translationText, lang, targetLang)
      }
    },
    [setSourceLang, translate, translationText, targetLang]
  )

  const handleTargetLangChange = useCallback(
    (lang: string) => {
      setTargetLang(lang)
      if (translationText) {
        translate(translationText, sourceLang, lang)
      }
    },
    [setTargetLang, translate, translationText, sourceLang]
  )

  const handleDictionary = useCallback(() => {
    if (!selection.text || !selection.rect) return

    const word = selection.text.trim()
    setDictionaryWord(word)
    setDictionaryRect(selection.rect)
    setShowDictionary(true)
    setVocabSaved(false)
    lookupWord(word, bookLanguage)
  }, [selection, lookupWord, bookLanguage])

  const handleCloseDictionary = useCallback(() => {
    setShowDictionary(false)
    setDictionaryWord('')
    setDictionaryRect(null)
    resetDictionary()
    clearSelection()
  }, [resetDictionary, clearSelection])

  const handleCopy = useCallback(() => {
    clearSelection()
    setShowTranslation(false)
    setShowDictionary(false)
  }, [clearSelection])

  const handleHighlightClick = useCallback(
    (highlight: StoredHighlight, rect: DOMRect) => {
      setEditingHighlight(highlight)
      setEditingHighlightRect(rect)
    },
    []
  )

  const handleNoteEditorClose = useCallback(() => {
    setEditingHighlight(null)
    setEditingHighlightRect(null)
  }, [])

  const handleNoteSave = useCallback(
    async (noteText: string | null) => {
      if (!editingHighlight) return
      await updateHighlight(editingHighlight.id, { noteText })
    },
    [editingHighlight, updateHighlight]
  )

  const handleHighlightDelete = useCallback(async () => {
    if (!editingHighlight) return
    await removeHighlight(editingHighlight.id)
    setEditingHighlight(null)
    setEditingHighlightRect(null)
  }, [editingHighlight, removeHighlight])

  // Save word to vocabulary from selection toolbar
  const handleSaveWord = useCallback(async () => {
    if (!selection.text || !selection.range || !containerRef.current || !isAuthenticated) return
    const word = selection.text.trim()
    if (!word || word.length > 200) return

    try {
      const sentence = extractSentence(selection.range, containerRef.current)
      // Grab translation/definition if already looked up
      const def = dictionaryEntry?.definitions?.[0]?.definitions?.[0]?.definition || undefined
      const trans = translatedText || undefined

      await saveWordApi({
        word,
        language: bookLanguage,
        translation: trans,
        definition: def,
        editionId: userBookId ? undefined : editionId || undefined,
        chapterId: userBookId ? undefined : chapterId || undefined,
        userBookId: userBookId || undefined,
        sentence: sentence || undefined,
        bookTitle: bookTitle || undefined,
      })
      setVocabToast('Word saved')
      setTimeout(() => setVocabToast(null), 2000)
      clearSelection()
    } catch {
      setVocabToast('Failed to save')
      setTimeout(() => setVocabToast(null), 2000)
    }
  }, [selection, containerRef, isAuthenticated, bookLanguage, editionId, chapterId, userBookId, bookTitle, dictionaryEntry, translatedText, clearSelection])

  // Save word from dictionary popup
  const handleSaveWordFromDict = useCallback(async (w: string, definition: string) => {
    if (!isAuthenticated) return
    setVocabSaved(false)
    try {
      const sentence = selection.range && containerRef.current
        ? extractSentence(selection.range, containerRef.current)
        : undefined
      await saveWordApi({
        word: w,
        language: bookLanguage,
        definition,
        translation: translatedText || undefined,
        editionId: userBookId ? undefined : editionId || undefined,
        chapterId: userBookId ? undefined : chapterId || undefined,
        userBookId: userBookId || undefined,
        sentence: sentence || undefined,
        bookTitle: bookTitle || undefined,
      })
      setVocabSaved(true)
    } catch {
      // ignore
    }
  }, [isAuthenticated, selection.range, containerRef, bookLanguage, translatedText, editionId, chapterId, userBookId, bookTitle])

  // Remove word from vocabulary
  const handleRemoveWord = useCallback(async (id: string, word: string) => {
    try {
      await removeVocabWord(id, word)
      autoSaveRef.current = ''
      setAutoSaveState('idle')
      setShowDictionary(false)
      setDictionaryWord('')
      setDictionaryRect(null)
      setVocabSaved(false)
      clearSelection()
    } catch {
      // ignore
    }
  }, [removeVocabWord, clearSelection])

  return (
    <div ref={wrapperRef} className="reader-highlights-wrapper" onContextMenu={(e) => e.preventDefault()}>
      {children}

      <HighlightLayer
        highlights={highlights}
        containerRef={containerRef}
        onHighlightClick={handleHighlightClick}
      />

      <VocabWordLayer
        containerRef={containerRef}
        vocabMap={vocabMap}
      />

      <ClickToTranslate
        containerRef={containerRef}
        wrapperRef={wrapperRef}
        sourceLang={bookLanguage}
        targetLang={targetLang}
      />

      {hasSelection && !showTranslation && !showDictionary && (
        <SelectionToolbar
          rect={selection.rect}
          text={selection.text}
          containerRef={containerRef}
          onHighlight={handleHighlight}
          onTranslate={handleTranslate}
          onDictionary={autoLookup ? undefined : handleDictionary}
          onSaveWord={autoLookup || !isAuthenticated ? undefined : handleSaveWord}
          onSpeak={autoLookup && isSingleWord ? undefined : () => handleSpeak(selection.text)}
          onCopy={handleCopy}
        />
      )}

      {hasSelection && isSingleWord && autoLookup && !showDictionary && !showTranslation && (() => {
        const vocabEntry = vocabMap.get(selectedWord.toLowerCase())
        return (
          <DictionaryCard
            word={selectedWord}
            entry={dictionaryEntry}
            isLoading={isDictionaryLoading}
            error={dictionaryError}
            rect={selection.rect}
            containerRef={containerRef}
            onExpand={handleExpandDictionary}
            onSpeak={(text) => handleSpeak(text)}
            savedState={autoSaveState}
            isAuthenticated={isAuthenticated}
            vocabStage={vocabEntry?.stage ?? null}
            onMarkKnown={vocabEntry?.id ? () => markVocabKnown(vocabEntry.id!, selectedWord) : undefined}
            onRemoveWord={vocabEntry?.id ? () => handleRemoveWord(vocabEntry.id!, selectedWord) : undefined}
          />
        )
      })()}

      {showTranslation && (
        <TranslationPopup
          text={translationText}
          translatedText={translatedText}
          isLoading={isTranslating}
          error={translationError}
          sourceLang={sourceLang}
          targetLang={targetLang}
          languages={languages}
          rect={translationRect}
          containerRef={containerRef}
          onSourceLangChange={handleSourceLangChange}
          onTargetLangChange={handleTargetLangChange}
          onSpeak={handleSpeak}
          onClose={handleCloseTranslation}
        />
      )}

      {showDictionary && (() => {
        const ve = vocabMap.get(dictionaryWord.toLowerCase())
        return (
          <DictionaryPopup
            word={dictionaryWord}
            entry={dictionaryEntry}
            isLoading={isDictionaryLoading}
            error={dictionaryError}
            rect={dictionaryRect}
            containerRef={containerRef}
            onClose={handleCloseDictionary}
            onSaveWord={isAuthenticated ? handleSaveWordFromDict : undefined}
            onSpeak={(text) => handleSpeak(text)}
            wordSaved={vocabSaved}
            vocabStage={ve?.stage ?? null}
            onMarkKnown={ve?.id ? () => markVocabKnown(ve.id!, dictionaryWord) : undefined}
            onRemoveWord={ve?.id ? () => handleRemoveWord(ve.id!, dictionaryWord) : undefined}
          />
        )
      })()}

      {editingHighlight && (
        <NoteEditor
          highlight={editingHighlight}
          rect={editingHighlightRect}
          containerRef={containerRef}
          onSave={handleNoteSave}
          onDelete={handleHighlightDelete}
          onClose={handleNoteEditorClose}
        />
      )}

      {vocabToast && (
        <div className="vocab-toast">{vocabToast}</div>
      )}
    </div>
  )
}
