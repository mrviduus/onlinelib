import { useRef, useCallback, useState, useEffect } from 'react'
import { useTextSelection } from '../../hooks/useTextSelection'
import { useHighlights } from '../../hooks/useHighlights'
import { useTextTranslation } from '../../hooks/useTextTranslation'
import { useNativeLanguage } from '../../context/NativeLanguageContext'
import { useTts } from '../../hooks/useTts'
import { useReaderVocabulary } from '../../hooks/useReaderVocabulary'
import { translate as translateApi } from '../../api/translation'
import { updateWord } from '../../api/vocabulary'
import { extractSentence } from '../../lib/sentenceExtractor'
import { createTextAnchor, findTextByAnchor } from '../../lib/textAnchor'
import type { HighlightColor, StoredHighlight } from '../../lib/offlineDb'
import { SelectionToolbar } from './SelectionToolbar'
import { HighlightLayer } from './HighlightLayer'
import { VocabWordLayer } from './VocabWordLayer'
import { TranslationPopup } from './TranslationPopup'
import { TranslationBubble, type BubbleState } from './TranslationBubble'
import { NoteEditor } from './NoteEditor'

interface ReaderHighlightsProps {
  editionId: string
  chapterId: string
  containerRef: React.RefObject<HTMLElement | null>
  isAuthenticated?: boolean
  bookLanguage?: string
  bookTitle?: string
  userBookId?: string
  ttsSpeed?: number
  scrollToHighlightId?: string | null
  showInlineTranslations?: boolean
  children: React.ReactNode
}

/** Resolve target language for translation: native lang, or null if same as book (definition mode) */
function resolveTargetLang(nativeLang: string, bookLang: string): string | null {
  if (nativeLang !== bookLang) return nativeLang
  return null
}

/** Count words in a trimmed selection string. */
function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export function ReaderHighlights({
  editionId,
  chapterId,
  containerRef,
  isAuthenticated: _isAuthenticated,
  bookLanguage = 'en',
  bookTitle,
  userBookId,
  ttsSpeed = 1.0,
  scrollToHighlightId,
  showInlineTranslations = false,
  children,
}: ReaderHighlightsProps) {
  const { nativeLanguage } = useNativeLanguage()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const targetLang = resolveTargetLang(nativeLanguage, bookLanguage)

  // --- Text selection ---
  const { selection, clearSelection, hasSelection } = useTextSelection(containerRef)

  const selectionWordCount = countWords(selection.text)
  const isSingleWord = hasSelection && selectionWordCount === 1

  // --- Vocab map + save/update (guest = real User via cookie session, same API path) ---
  const { vocabMap, addWord, updateTranslation } = useReaderVocabulary(bookLanguage, targetLang)

  // --- Single-word translation bubble ---
  const [bubble, setBubble] = useState<{
    word: string
    translation: string | null
    state: BubbleState
    rect: DOMRect | null
    saved: boolean
  } | null>(null)
  const bubbleAbortRef = useRef<AbortController | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearSavedTimer = useCallback(() => {
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current)
      savedTimerRef.current = null
    }
  }, [])

  const closeBubble = useCallback(() => {
    bubbleAbortRef.current?.abort()
    clearSavedTimer()
    setBubble(null)
  }, [clearSavedTimer])

  // Trigger bubble when selection narrows to 1 word.
  useEffect(() => {
    if (!isSingleWord || !selection.rect || !selection.text) {
      // Selection cleared or grew → drop any open bubble.
      if (!isSingleWord) closeBubble()
      return
    }
    const word = selection.text.trim()
    // Same-lang: show the word itself as "translation" is meaningless.
    // Instead show nothing (bail) — keeps UX honest.
    if (!targetLang) {
      closeBubble()
      return
    }
    // If same word already shown, don't re-fetch.
    if (bubble?.word === word) return

    bubbleAbortRef.current?.abort()
    const ctrl = new AbortController()
    bubbleAbortRef.current = ctrl
    setBubble({ word, translation: null, state: 'loading', rect: selection.rect, saved: false })
    clearSavedTimer()

    // Fire-and-forget vocab save in parallel with translation (dedup via vocabMap)
    const shouldSave = !vocabMap.has(word.toLowerCase())
    const container = containerRef.current
    const sentence = selection.range && container
      ? extractSentence(selection.range, container)
      : undefined
    const savePromise = shouldSave
      ? addWord({
          word,
          language: bookLanguage,
          editionId: userBookId ? undefined : (editionId || undefined),
          chapterId: userBookId ? undefined : (chapterId || undefined),
          userBookId: userBookId || undefined,
          sentence: sentence || undefined,
          bookTitle: bookTitle || undefined,
          nativeLanguage: targetLang || undefined,
        }).catch(() => null)
      : Promise.resolve(null)

    Promise.all([savePromise, translateApi(word, bookLanguage, targetLang, ctrl.signal)])
      .then(([saved, res]) => {
        if (ctrl.signal.aborted) return
        const didSave = shouldSave && saved != null
        setBubble({
          word, translation: res.translatedText, state: 'ready',
          rect: selection.rect, saved: didSave,
        })
        if (didSave) {
          clearSavedTimer()
          savedTimerRef.current = setTimeout(() => {
            setBubble(b => (b && b.word === word) ? { ...b, saved: false } : b)
          }, 1000)
        }
        if (res.translatedText) {
          if (saved?.id) updateWord(saved.id, { translation: res.translatedText }).catch(() => {})
          updateTranslation(word, res.translatedText)
        }
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return
        if ((err as { name?: string })?.name === 'AbortError') return
        setBubble({ word, translation: null, state: 'error', rect: selection.rect, saved: false })
      })
  }, [
    isSingleWord, selection.text, selection.rect, selection.range,
    bookLanguage, targetLang, bubble?.word, closeBubble, clearSavedTimer,
    vocabMap, addWord, updateTranslation,
    containerRef, editionId, chapterId, userBookId, bookTitle,
  ])

  // Clean abort + saved timer on unmount
  useEffect(() => () => {
    bubbleAbortRef.current?.abort()
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
  }, [])

  // --- Highlights ---
  const {
    highlights, addHighlight, updateHighlight, removeHighlight,
  } = useHighlights(userBookId ? undefined : editionId, userBookId, {
    chapterId,
    isAuthenticated: _isAuthenticated,
  })

  // Scroll to highlight when navigating from highlights page
  const scrolledRef = useRef(false)
  useEffect(() => {
    if (!scrollToHighlightId || scrolledRef.current) return
    if (highlights.length === 0 || !containerRef.current) return

    const target = highlights.find(h => h.id === scrollToHighlightId)
    if (!target) return

    scrolledRef.current = true
    requestAnimationFrame(() => {
      const range = findTextByAnchor(target.anchor, containerRef.current!)
      const el = range?.startContainer.parentElement
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [scrollToHighlightId, highlights, containerRef])

  // --- Highlight note editing ---
  const [editingHighlight, setEditingHighlight] = useState<StoredHighlight | null>(null)
  const [editingRect, setEditingRect] = useState<DOMRect | null>(null)

  const handleHighlightClick = useCallback(
    (highlight: StoredHighlight, rect: DOMRect) => {
      setEditingHighlight(highlight)
      setEditingRect(rect)
    }, []
  )

  const closeNoteEditor = useCallback(() => {
    setEditingHighlight(null)
    setEditingRect(null)
  }, [])

  const handleNoteSave = useCallback(
    async (noteText: string | null) => {
      if (editingHighlight) await updateHighlight(editingHighlight.id, { noteText })
    },
    [editingHighlight, updateHighlight]
  )

  const handleHighlightDelete = useCallback(async () => {
    if (!editingHighlight) return
    await removeHighlight(editingHighlight.id)
    closeNoteEditor()
  }, [editingHighlight, removeHighlight, closeNoteEditor])

  // --- TTS ---
  const { speak } = useTts()
  const handleSpeak = useCallback((text: string, lang?: string) => {
    speak(text, lang || bookLanguage, undefined, ttsSpeed)
  }, [speak, bookLanguage, ttsSpeed])

  // --- Multi-word translation popup ---
  const {
    translatedText, isLoading: isTranslating, error: translationError,
    translate, reset: resetTranslation,
    languages, sourceLang, targetLang: translationTargetLang,
    setSourceLang, setTargetLang,
  } = useTextTranslation({
    defaultSourceLang: bookLanguage,
    defaultTargetLang: targetLang,
  })

  const [showTranslation, setShowTranslation] = useState(false)
  const [translationText, setTranslationText] = useState('')
  const [translationRect, setTranslationRect] = useState<DOMRect | null>(null)

  const handleTranslate = useCallback(() => {
    if (!selection.text || !selection.rect) return
    const text = selection.text.slice(0, 500)
    setTranslationText(text)
    setTranslationRect(selection.rect)
    setShowTranslation(true)
    translate(text)
  }, [selection, translate])

  const handleCloseTranslation = useCallback(() => {
    setShowTranslation(false)
    setTranslationText('')
    setTranslationRect(null)
    resetTranslation()
    clearSelection()
  }, [resetTranslation, clearSelection])

  const handleSourceLangChange = useCallback((lang: string) => {
    setSourceLang(lang)
    if (translationText) translate(translationText, lang, translationTargetLang)
  }, [setSourceLang, translate, translationText, translationTargetLang])

  const handleTargetLangChange = useCallback((lang: string) => {
    setTargetLang(lang)
    if (translationText) translate(translationText, sourceLang, lang)
  }, [setTargetLang, translate, translationText, sourceLang])

  // --- Selection toolbar ---
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

  const handleCopy = useCallback(() => {
    clearSelection()
    setShowTranslation(false)
  }, [clearSelection])

  // --- Render ---
  return (
    <div ref={wrapperRef} className="reader-highlights-wrapper" onContextMenu={(e) => e.preventDefault()}>
      {children}

      <HighlightLayer
        highlights={highlights}
        containerRef={containerRef}
        onHighlightClick={handleHighlightClick}
      />

      <VocabWordLayer containerRef={containerRef} vocabMap={vocabMap} showInlineTranslations={showInlineTranslations} />

      {/* Multi-word selection → full highlights toolbar */}
      {hasSelection && !isSingleWord && !showTranslation && (
        <SelectionToolbar
          rect={selection.rect}
          text={selection.text}
          containerRef={containerRef}
          onHighlight={handleHighlight}
          onTranslate={handleTranslate}
          onSpeak={() => handleSpeak(selection.text)}
          onCopy={handleCopy}
        />
      )}

      {/* Single-word selection → minimal auto-fading bubble */}
      {bubble && isSingleWord && !showTranslation && (
        <TranslationBubble
          word={bubble.word}
          translation={bubble.translation}
          state={bubble.state}
          rect={bubble.rect}
          saved={bubble.saved}
          onClose={closeBubble}
        />
      )}

      {showTranslation && (
        <TranslationPopup
          text={translationText}
          translatedText={translatedText}
          isLoading={isTranslating}
          error={translationError}
          sourceLang={sourceLang}
          targetLang={translationTargetLang}
          languages={languages}
          rect={translationRect}
          containerRef={containerRef}
          onSourceLangChange={handleSourceLangChange}
          onTargetLangChange={handleTargetLangChange}
          onSpeak={handleSpeak}
          onClose={handleCloseTranslation}
        />
      )}

      {editingHighlight && (
        <NoteEditor
          highlight={editingHighlight}
          rect={editingRect}
          containerRef={containerRef}
          onSave={handleNoteSave}
          onDelete={handleHighlightDelete}
          onClose={closeNoteEditor}
        />
      )}
    </div>
  )
}
