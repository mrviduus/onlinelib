import { useRef, useCallback, useState, useEffect } from 'react'
import { useTextSelection } from '../../hooks/useTextSelection'
import { useHighlights } from '../../hooks/useHighlights'
import { useTextTranslation } from '../../hooks/useTextTranslation'
import { useNativeLanguage } from '../../context/NativeLanguageContext'
import { useTts } from '../../hooks/useTts'
import { useReaderVocabulary } from '../../hooks/useReaderVocabulary'
import { useDictionary } from '../../hooks/useDictionary'
import { useTranslation } from '../../hooks/useTranslation'
import { useBubbleTranslationSync } from '../../hooks/useBubbleTranslationSync'
import { updateWord } from '../../api/vocabulary'
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
import { TtsHighlightOverlay } from './TtsHighlightOverlay'
import { Toast } from '../Toast'
import { useAuth } from '../../context/AuthContext'

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

/**
 * Resolve target language for translation. Returns null (= definition mode /
 * no translation fetch) when:
 * - native not yet confirmed (value is a `navigator.language` guess we shouldn't
 *   trust — saving vocab with a guessed native poisons SRS explanations), OR
 * - native equals book language (user has nothing to translate into).
 */
function resolveTargetLang(nativeLang: string, bookLang: string, hasConfirmed: boolean): string | null {
  if (!hasConfirmed) return null
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
  const { nativeLanguage, setNativeLanguage, hasConfirmedLanguage } = useNativeLanguage()
  const { t } = useTranslation()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const targetLang = resolveTargetLang(nativeLanguage, bookLanguage, hasConfirmedLanguage)

  // --- Text selection ---
  const { selection, clearSelection, hasSelection } = useTextSelection(containerRef)

  const selectionWordCount = countWords(selection.text)
  const isSingleWord = hasSelection && selectionWordCount === 1

  // --- Vocab map + save/update (guest = real User via cookie session, same API path) ---
  const { vocabMap, addWord, removeWord, updateTranslation, idbUnavailable, dismissIdbUnavailable } = useReaderVocabulary(bookLanguage, targetLang)
  const { openAuthModal } = useAuth()

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

  // Backend translation patch + mid-popup lang-switch refetch + auto-save dedup.
  // Extracted hook — same shape is used in FocusReaderPage.
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
    // Clear selection to break the effect loop: without this, selection persists,
    // isSingleWord stays true, bubble is null → effect re-fires → mercание.
    clearSelection()
  }, [clearSelection])

  // Auto-save: invoked from openBubble on every word tap (unless the word is
  // already saved or a save is in-flight). Captures sentence from the live range
  // at tap time. Translation may be null at this point — `fetchWordBubble` resolves
  // it async, and the translation-patch effect below forwards it to the backend.
  const handleSave = useCallback(async (word: string, range: Range | null) => {
    // Gate: never save vocab with an unconfirmed native. A guessed
    // `navigator.language` isn't a real user choice — persisting it poisons the
    // SRS enrichment pipeline (explanations generated in wrong language) and
    // can't be retroactively fixed once LLM fields are cached. Throw so
    // `triggerAutoSave`'s catch clears the dedup key, letting re-tap retry
    // after the user confirms via WordPopup's picker.
    if (!hasConfirmedLanguage) {
      throw new Error('native_language_not_confirmed')
    }
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
      // Send the actual confirmed native language (not `targetLang`, which is
      // null in same-lang definition mode — but the user's explicit choice is
      // still a valid native we want the backend to record for SRS enrichment).
      nativeLanguage: nativeLanguage,
      translation: currentTranslation || null,
    }).catch(() => null)
    if (saved?.id && currentTranslation) {
      updateWord(saved.id, { translation: currentTranslation }).catch(() => {})
      updateTranslation(word, currentTranslation)
    }
  }, [
    addWord, bookLanguage, bookTitle, chapterId, containerRef,
    editionId, nativeLanguage, hasConfirmedLanguage, userBookId, updateTranslation,
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

    // Auto-save via shared dedup hook (sync ref seals race that vocabMap can't —
    // state commit is async, a second rapid tap would see has(key)===false).
    // Skip when native isn't confirmed: save is deferred until the user picks
    // a native language in WordPopup's picker (see catch-up effect below).
    if (hasConfirmedLanguage) {
      triggerAutoSave(word, () => handleSave(word, range))
    }
  }, [bookLanguage, targetLang, vocabMap, updateTranslation, lookupWord, handleSave, triggerAutoSave, hasConfirmedLanguage])

  // Catch-up auto-save: if the user taps a word BEFORE confirming native
  // language, openBubble opens the popup but skips the save. When they then
  // pick a language via the popup's picker, `hasConfirmedLanguage` flips true
  // while the same bubble is still on screen — fire the save now so they
  // don't have to re-tap. `triggerAutoSave`'s dedup prevents a duplicate if
  // the openBubble branch also fired (confirmed-first path).
  const prevConfirmedRef = useRef(hasConfirmedLanguage)
  useEffect(() => {
    if (!prevConfirmedRef.current && hasConfirmedLanguage && bubble) {
      triggerAutoSave(bubble.word, () => handleSave(bubble.word, bubble.range))
    }
    prevConfirmedRef.current = hasConfirmedLanguage
  }, [hasConfirmedLanguage, bubble, triggerAutoSave, handleSave])

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
  const { speak, stop: stopTts, isPlaying: ttsPlaying, timestamps: ttsTimestamps, currentWordIndex: ttsCurrentWord } = useTts()
  // Captured at speak() time so the overlay has text to split + highlight even
  // after the selection is cleared. Cleared explicitly on stop() — relying on
  // `isPlaying` alone would leave the last text flashing between playbacks.
  const [ttsSpokenText, setTtsSpokenText] = useState<string | null>(null)
  const handleSpeak = useCallback((text: string, lang?: string) => {
    setTtsSpokenText(text)
    speak(text, lang || bookLanguage, undefined, ttsSpeed)
  }, [speak, bookLanguage, ttsSpeed])
  const handleStopTts = useCallback(() => {
    stopTts()
    setTtsSpokenText(null)
  }, [stopTts])

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
              clearAutoSave(bubble.word)
              closeBubble()
            } : undefined}
            onClose={closeBubble}
            isSaved={isSaved}
            nativeLanguage={nativeLanguage}
            onChangeNativeLanguage={setNativeLanguage}
            hasConfirmedLanguage={hasConfirmedLanguage}
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

      {idbUnavailable && (
        <Toast
          message={t('reader.idbUnavailable')}
          duration={5000}
          onClose={dismissIdbUnavailable}
          onClick={() => { dismissIdbUnavailable(); openAuthModal() }}
        />
      )}

      {/* Floating overlay with per-word highlighting during multi-word TTS.
          Skip single-word playback (handled by WordPopup's own speaker icon)
          so a word tap doesn't pop a redundant bar at the bottom. */}
      <TtsHighlightOverlay
        text={ttsSpokenText ?? ''}
        timestamps={ttsTimestamps}
        currentWordIndex={ttsCurrentWord}
        visible={ttsPlaying && !!ttsSpokenText && countWords(ttsSpokenText) > 1}
        onStop={handleStopTts}
      />
    </div>
  )
}
