import { useRef, useCallback, useState, useEffect } from 'react'
import { useTextSelection } from '../../hooks/useTextSelection'
import { useHighlights } from '../../hooks/useHighlights'
import { useTextTranslation } from '../../hooks/useTextTranslation'
import { useNativeLanguage } from '../../context/NativeLanguageContext'
import { useTts } from '../../hooks/useTts'
import { useReaderVocabulary } from '../../hooks/useReaderVocabulary'
import { useDictionary } from '../../hooks/useDictionary'
import { useTranslation } from '../../hooks/useTranslation'
import { translate as translateApi } from '../../api/translation'
import { updateWord } from '../../api/vocabulary'
import { extractSentence } from '../../lib/sentenceExtractor'
import { createTextAnchor, findTextByAnchor } from '../../lib/textAnchor'
import { tokenizeVocabWords, normalizeVocabKey, extractWordFromRange } from '../../lib/vocabKey'
import type { HighlightColor, StoredHighlight } from '../../lib/offlineDb'
import { SelectionToolbar } from './SelectionToolbar'
import { HighlightLayer } from './HighlightLayer'
import { VocabWordLayer } from './VocabWordLayer'
import { TranslationPopup } from './TranslationPopup'
import { WordPopup } from './WordPopup'
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
  const { nativeLanguage, setNativeLanguage } = useNativeLanguage()
  const { t } = useTranslation()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const targetLang = resolveTargetLang(nativeLanguage, bookLanguage)

  // --- Text selection ---
  const { selection, clearSelection, hasSelection } = useTextSelection(containerRef)

  const selectionWordCount = countWords(selection.text)
  const isSingleWord = hasSelection && selectionWordCount === 1

  // --- Vocab map + save/update (guest = real User via cookie session, same API path) ---
  const { vocabMap, addWord, removeWord, updateTranslation } = useReaderVocabulary(bookLanguage, targetLang)

  // --- Dictionary (phonetic + definition) ---
  const { lookup: lookupWord } = useDictionary()

  // --- Single-word popup state ---
  const [bubble, setBubble] = useState<{
    word: string
    translation: string | null
    translationLoading: boolean
    phonetic: string | undefined
    definition: string | null
    definitionLoading: boolean
    rect: DOMRect | null
    range: Range | null
  } | null>(null)
  const bubbleAbortRef = useRef<AbortController | null>(null)
  // Stabilization delay before opening popup. Filters out transient single-word
  // selections fired by iOS tap-to-select / scroll-jitter / incidental taps.
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const STABILIZE_MS = 220

  const closeBubble = useCallback(() => {
    if (openTimerRef.current) { clearTimeout(openTimerRef.current); openTimerRef.current = null }
    bubbleAbortRef.current?.abort()
    setBubble(null)
    // Clear selection to break the effect loop: without this, selection persists,
    // isSingleWord stays true, bubble is null → effect re-fires → mercание.
    clearSelection()
  }, [clearSelection])

  // Popup creation, extracted so the scheduling effect has tight deps and doesn't
  // re-fire on translation/definition arrival. Save is now EXPLICIT — only fetches
  // translation + dictionary; `handleSave` is invoked from WordPopup on user click.
  const openBubble = useCallback((word: string, rect: DOMRect, range: Range | null) => {
    bubbleAbortRef.current?.abort()
    const ctrl = new AbortController()
    bubbleAbortRef.current = ctrl
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

    // Dictionary lookup (phonetic + definition) — runs regardless of targetLang.
    lookupWord(word, bookLanguage)
      .then((entry) => {
        if (ctrl.signal.aborted) return
        setBubble((prev) =>
          prev && prev.word === word
            ? {
                ...prev,
                phonetic: entry?.phonetic,
                definition: entry?.definitions?.[0]?.definitions?.[0]?.definition ?? null,
                definitionLoading: false,
              }
            : prev,
        )
      })
      .catch(() => {
        if (ctrl.signal.aborted) return
        setBubble((prev) => (prev && prev.word === word ? { ...prev, definitionLoading: false } : prev))
      })

    // Translation fetch (no save).
    if (!targetLang) return
    translateApi(word, bookLanguage, targetLang, ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return
        const translatedText = res?.translatedText ?? null
        setBubble((prev) =>
          prev && prev.word === word
            ? { ...prev, translation: translatedText, translationLoading: false }
            : prev,
        )
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
        if (ctrl.signal.aborted) return
        if ((err as { name?: string })?.name === 'AbortError') return
        setBubble((prev) =>
          prev && prev.word === word ? { ...prev, translationLoading: false } : prev,
        )
      })
  }, [
    bookLanguage, targetLang,
    vocabMap, updateTranslation, lookupWord,
  ])

  // Explicit save: invoked from WordPopup when user clicks Save. Captures sentence
  // from the range stored on the bubble at tap time (may be stale if selection was
  // cleared, but vocab save doesn't require a live range).
  const handleSave = useCallback(async (word: string, range: Range | null) => {
    const container = containerRef.current
    const sentence = range && container ? extractSentence(range, container) : undefined
    const currentTranslation = bubble?.word === word ? bubble?.translation : null
    const saved = await addWord({
      word,
      language: bookLanguage,
      editionId: userBookId ? undefined : (editionId || undefined),
      chapterId: userBookId ? undefined : (chapterId || undefined),
      userBookId: userBookId || undefined,
      sentence: sentence || undefined,
      bookTitle: bookTitle || undefined,
      nativeLanguage: targetLang || undefined,
      translation: currentTranslation || null,
    }).catch(() => null)
    if (saved?.id && currentTranslation) {
      updateWord(saved.id, { translation: currentTranslation }).catch(() => {})
      updateTranslation(word, currentTranslation)
    }
  }, [
    addWord, bookLanguage, bookTitle, chapterId, containerRef,
    editionId, targetLang, userBookId, updateTranslation,
    bubble?.word, bubble?.translation,
  ])

  // Trigger popup when selection narrows to 1 word — with a short stabilization window
  // so transient selections (iOS auto-select, scroll-tap jitter) don't flash the popup.
  useEffect(() => {
    if (!isSingleWord || !selection.rect || !selection.text) {
      // Selection cleared or grew → cancel any pending open + drop existing popup.
      if (openTimerRef.current) { clearTimeout(openTimerRef.current); openTimerRef.current = null }
      if (!isSingleWord) {
        bubbleAbortRef.current?.abort()
        setBubble(null)
      }
      return
    }
    // Extract word from selection. Prefer DOM-aware extraction (strips
    // .vocab-inline-translation text that Selection API concatenates with the word
    // when both are in the same <mark> — e.g. "amiableприветливый"). Fallback to
    // tokenizer on raw text to strip NBSP / zero-width chars. Preserves case.
    const word = extractWordFromRange(selection.range)
      ?? tokenizeVocabWords(selection.text)[0]?.word
      ?? selection.text.trim()
    if (!word) return
    // If same word already shown, don't re-fetch.
    if (bubble?.word === word) return

    // Debounce: schedule opening, cancel if selection changes again within the window.
    // Net effect: brief accidental word-selections never create a bubble.
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
  }, [isSingleWord, selection.text, selection.rect, selection.range, bubble?.word, openBubble])

  // Clean abort + pending open timer on unmount
  useEffect(() => () => {
    bubbleAbortRef.current?.abort()
    if (openTimerRef.current) clearTimeout(openTimerRef.current)
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

  // Auto-play TTS when popup opens on a new word (not on every translation/definition update).
  useEffect(() => {
    if (bubble?.word) handleSpeak(bubble.word)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubble?.word])

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

      {/* Single-word selection → WordPopup (phonetic, translation, definition, Save/Remove) */}
      {bubble && isSingleWord && !showTranslation && (() => {
        const entry = vocabMap.get(normalizeVocabKey(bubble.word))
        const isSaved = !!entry
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
            onSpeak={() => handleSpeak(bubble.word)}
            onSave={!isSaved ? () => handleSave(bubble.word, bubble.range) : undefined}
            onRemove={entry?.id ? () => { removeWord(entry.id!, bubble.word); closeBubble() } : undefined}
            onClose={closeBubble}
            isSaved={isSaved}
            nativeLanguage={nativeLanguage}
            onChangeNativeLanguage={setNativeLanguage}
            bookLanguage={bookLanguage}
            t={t}
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
