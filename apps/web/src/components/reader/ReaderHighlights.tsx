import { useRef, useCallback, useState, useEffect } from 'react'
import { useTextSelection } from '../../hooks/useTextSelection'
import { useHighlights } from '../../hooks/useHighlights'
import { useTextTranslation } from '../../hooks/useTextTranslation'
import { useNativeLanguage } from '../../context/NativeLanguageContext'
import { useTts } from '../../hooks/useTts'
import { useReaderVocabulary } from '../../hooks/useReaderVocabulary'
import { useDictionary } from '../../hooks/useDictionary'
import { useTranslation } from '../../hooks/useTranslation'
import { updateWord } from '../../api/vocabulary'
import { translate as translateApi } from '../../api/translation'
import { extractSentence } from '../../lib/sentenceExtractor'
import { createTextAnchor, findTextByAnchor } from '../../lib/textAnchor'
import { tokenizeVocabWords, normalizeVocabKey, extractWordFromRange } from '../../lib/vocabKey'
import { fetchWordBubble } from '../../lib/wordBubbleFetch'
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
  // Auto-save dedup: word keys that have an in-flight or completed save in this
  // component instance. Prevents duplicate POST /me/vocabulary/words when two
  // openBubble calls race (e.g. rapid re-tap before vocabMap re-renders).
  const autoSavedRef = useRef<Set<string>>(new Set())
  // Translation-patch dedup: one backend patch per (wordId, translation) pair.
  const patchedTranslationRef = useRef<Set<string>>(new Set())

  const closeBubble = useCallback(() => {
    if (openTimerRef.current) { clearTimeout(openTimerRef.current); openTimerRef.current = null }
    bubbleAbortRef.current?.abort()
    setBubble(null)
    // Clear selection to break the effect loop: without this, selection persists,
    // isSingleWord stays true, bubble is null → effect re-fires → mercание.
    clearSelection()
  }, [clearSelection])

  // Auto-save: invoked from openBubble on every word tap (unless the word is
  // already saved or a save is in-flight). Captures sentence from the live range
  // at tap time. Translation may be null at this point — `fetchWordBubble` resolves
  // it async, and the translation-patch effect below forwards it to the backend.
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

  // Popup creation, extracted so the scheduling effect has tight deps and doesn't
  // re-fire on translation/definition arrival. Also fires auto-save for the tapped
  // word (fire-and-forget) so the user doesn't need an explicit Save click.
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
    fetchWordBubble({
      word, bookLanguage, targetLang,
      lookup: lookupWord, vocabMap, updateTranslation,
      signal: ctrl.signal,
      patch: (fields) => setBubble((prev) => (prev && prev.word === word ? { ...prev, ...fields } : prev)),
    })

    // Auto-save. Guards: (1) already in vocab → user-delete flow; (2) already
    // in-flight in this session → ref seals the race that vocabMap can't (state
    // commit is async, so a second rapid tap would still see has(key)===false).
    const key = normalizeVocabKey(word)
    if (!vocabMap.has(key) && !autoSavedRef.current.has(key)) {
      autoSavedRef.current.add(key)
      handleSave(word, range).catch(() => {
        autoSavedRef.current.delete(key)
      })
    }
  }, [bookLanguage, targetLang, vocabMap, updateTranslation, lookupWord, handleSave])

  // Translation patch after auto-save. `fetchWordBubble` captures vocabMap via
  // closure at call time — BEFORE auto-save inserts the entry — so its built-in
  // patch (wordBubbleFetch.ts:68-74) misses. We watch bubble.translation and apply
  // the backend patch once per (id, translation) pair. Guest entries (isPending)
  // are skipped: flushPendingIfAny reads mapRef translation at flush time.
  useEffect(() => {
    const word = bubble?.word
    const translation = bubble?.translation
    if (!word || !translation) return
    const entry = vocabMap.get(normalizeVocabKey(word))
    if (!entry?.id || entry.isPending) return
    const patchKey = `${entry.id}:${translation}`
    if (patchedTranslationRef.current.has(patchKey)) return
    patchedTranslationRef.current.add(patchKey)
    updateWord(entry.id, { translation }).catch(() => {})
    updateTranslation(word, translation)
  }, [bubble?.word, bubble?.translation, vocabMap, updateTranslation])

  // Refetch translation when targetLang changes mid-popup (user opens lang picker
  // in the popup and switches native language). openBubble fires the initial fetch
  // — this effect handles every subsequent lang switch for the same word.
  // Tracks (word, lang) pair so word changes (handled by openBubble) don't double-fetch.
  const lastFetchedPairRef = useRef<string | null>(null)
  useEffect(() => {
    const word = bubble?.word
    if (!word) {
      lastFetchedPairRef.current = null
      return
    }
    const pairKey = `${word}::${targetLang ?? ''}`
    if (lastFetchedPairRef.current === null) {
      // Initial open: openBubble already kicked off the fetch. Just record.
      lastFetchedPairRef.current = pairKey
      return
    }
    if (lastFetchedPairRef.current === pairKey) return

    const [prevWord] = lastFetchedPairRef.current.split('::')
    lastFetchedPairRef.current = pairKey
    // Word changed → openBubble owns the fetch. Skip.
    if (prevWord !== word) return

    // Same word, lang flipped. Switched into definition mode (no targetLang) → clear translation.
    if (!targetLang) {
      setBubble((prev) => prev && prev.word === word ? { ...prev, translation: null, translationLoading: false } : prev)
      return
    }

    // Refetch translation only — definition is language-independent (always in book lang).
    bubbleAbortRef.current?.abort()
    const ctrl = new AbortController()
    bubbleAbortRef.current = ctrl
    setBubble((prev) => prev && prev.word === word ? { ...prev, translation: null, translationLoading: true } : prev)
    translateApi(word, bookLanguage, targetLang, ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return
        const translatedText = res?.translatedText ?? null
        setBubble((prev) => prev && prev.word === word ? { ...prev, translation: translatedText, translationLoading: false } : prev)
        if (translatedText) {
          const existing = vocabMap.get(normalizeVocabKey(word))
          if (existing?.id && !existing.isPending) {
            updateWord(existing.id, { translation: translatedText }).catch(() => {})
          }
          if (existing) updateTranslation(word, translatedText)
        }
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return
        if ((err as { name?: string })?.name === 'AbortError') return
        setBubble((prev) => prev && prev.word === word ? { ...prev, translationLoading: false } : prev)
      })
  }, [bubble?.word, targetLang, bookLanguage, vocabMap, updateTranslation])

  // Trigger popup when selection narrows to 1 word — with a short stabilization window
  // so transient selections (iOS auto-select, scroll-tap jitter) don't flash the popup.
  useEffect(() => {
    if (!isSingleWord || !selection.rect || !selection.text) {
      // Cancel any pending open.
      if (openTimerRef.current) { clearTimeout(openTimerRef.current); openTimerRef.current = null }
      // Drop bubble ONLY when selection grew to multi-word (toolbar takes over).
      // Empty selection must NOT close the popup: clicking a button inside the
      // popup natively clears the document selection — we'd kill our own popup.
      // Click-outside-popup is handled by WordPopup's own listener.
      if (hasSelection && !isSingleWord) {
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
  }, [isSingleWord, hasSelection, selection.text, selection.rect, selection.range, bubble?.word, openBubble])

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

      {/* Single-word selection → WordPopup (phonetic, translation, definition, Remove). Save is automatic. */}
      {/* NOT gated on isSingleWord: clicking buttons inside the popup natively
          clears the document selection — keeping the popup mounted lets the user
          interact with it (lang picker, etc). Close paths: WordPopup's own
          click-outside / Escape / × / auto-dismiss, or selection growing to multi-word. */}
      {bubble && !showTranslation && (() => {
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
            onRemove={entry?.id ? () => {
              removeWord(entry.id!, bubble.word)
              // Clear dedup so a subsequent tap on the same word re-auto-saves.
              autoSavedRef.current.delete(normalizeVocabKey(bubble.word))
              closeBubble()
            } : undefined}
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
