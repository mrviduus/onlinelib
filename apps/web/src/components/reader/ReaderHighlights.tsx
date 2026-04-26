import { useRef, useCallback, useState } from 'react'
import { useTextSelection } from '../../hooks/useTextSelection'
import { useHighlightEdit } from '../../hooks/useHighlightEdit'
import { useTranslationPopup } from '../../hooks/useTranslationPopup'
import { useExplainPopup } from '../../hooks/useExplainPopup'
import { useNativeLanguage } from '../../context/NativeLanguageContext'
import { useReaderTts } from '../../hooks/useReaderTts'
import { useReaderVocabulary } from '../../hooks/useReaderVocabulary'
import { useDictionary } from '../../hooks/useDictionary'
import { useTranslation } from '../../hooks/useTranslation'
import { useWordBubble } from '../../hooks/useWordBubble'
import { normalizeVocabKey } from '../../lib/vocabKey'
import type { HighlightColor } from '../../lib/offlineDb'
import { SelectionToolbar } from './SelectionToolbar'
import { HighlightOverlayLayer } from './HighlightOverlayLayer'
import { VocabOverlayLayer } from './VocabOverlayLayer'
import { TranslationPopup } from './TranslationPopup'
import { ExplanationPopup } from './ExplanationPopup'
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

// Returns null (= definition mode) when native equals book language.
// We deliberately do NOT gate on hasConfirmedLanguage here: onboarding
// wow factor requires a translation on first tap. Save-path has its own
// confirmation gate (handleSave throws 'native_language_not_confirmed'),
// so translating here cannot poison the SRS pipeline.
function resolveTargetLang(nativeLang: string, bookLang: string): string | null {
  return nativeLang !== bookLang ? nativeLang : null
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
  const targetLang = resolveTargetLang(nativeLanguage, bookLanguage)

  // --- Text selection ---
  const { selection, clearSelection, hasSelection } = useTextSelection(containerRef)

  const selectionWordCount = countWords(selection.text)
  const isSingleWord = hasSelection && selectionWordCount === 1

  // --- Vocab map + save/update (guest = real User via cookie session, same API path) ---
  const vocab = useReaderVocabulary(bookLanguage, targetLang)
  const { vocabMap, removeWord, idbUnavailable, dismissIdbUnavailable } = vocab
  const { openAuthModal } = useAuth()

  // Anti-spiral F2: toast when a save lands in the pending queue (daily cap hit).
  // Cleared on auto-dismiss; new pending saves overwrite the message.
  const [pendingToast, setPendingToast] = useState<string | null>(null)

  // --- Dictionary (phonetic + definition) ---
  const { lookup: lookupWord } = useDictionary()

  // --- Single-word popup (state + selection→bubble + auto-save + add-anyway) ---
  const {
    bubble, lookupState, addAnywayBusy, savingWord,
    closeBubble, handleAddAnyway, clearAutoSave,
  } = useWordBubble({
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
    onPendingToast: setPendingToast,
    t,
  })

  // --- Highlights (CRUD + note editor + scroll-to deep link) ---
  const {
    highlights,
    editingHighlight,
    editingRect,
    handleHighlightClick,
    closeNoteEditor,
    handleNoteSave,
    handleHighlightDelete,
    createHighlightFromSelection,
  } = useHighlightEdit({
    editionId,
    userBookId,
    chapterId,
    containerRef,
    isAuthenticated: _isAuthenticated,
    scrollToHighlightId,
  })

  // --- TTS (auto-plays on bubble open; tracks spoken text for the overlay) ---
  const {
    spokenText: ttsSpokenText,
    timestamps: ttsTimestamps,
    currentWordIndex: ttsCurrentWord,
    isPlaying: ttsPlaying,
    speak: handleSpeak,
    stop: handleStopTts,
  } = useReaderTts({
    bookLanguage,
    ttsSpeed,
    autoPlayWord: bubble?.word ?? null,
  })

  // --- Multi-word translation popup ---
  const translationPopup = useTranslationPopup({
    bookLanguage,
    targetLang,
    onClose: clearSelection,
  })

  const handleTranslate = useCallback(() => {
    if (!selection.text || !selection.rect) return
    translationPopup.open(selection.text, selection.rect)
  }, [selection.text, selection.rect, translationPopup])

  // --- Explain popup ---
  const explainPopup = useExplainPopup({
    containerRef,
    editionId,
    nativeLanguage,
    onClose: clearSelection,
  })

  const handleExplain = useCallback(() => {
    explainPopup.openFromSelection(selection.text, selection.range, selection.rect)
  }, [explainPopup, selection.text, selection.range, selection.rect])

  // --- Selection toolbar ---
  const handleHighlight = useCallback(
    async (color: HighlightColor) => {
      await createHighlightFromSelection(selection.range, selection.text, color)
      clearSelection()
      translationPopup.close()
    },
    [selection.range, selection.text, createHighlightFromSelection, clearSelection, translationPopup],
  )

  const handleCopy = useCallback(() => {
    clearSelection()
    translationPopup.close()
  }, [clearSelection, translationPopup])

  // --- Render ---
  return (
    <div ref={wrapperRef} className="reader-highlights-wrapper" onContextMenu={(e) => e.preventDefault()}>
      {children}

      <HighlightOverlayLayer
        highlights={highlights}
        containerRef={containerRef}
        onHighlightClick={handleHighlightClick}
      />

      <VocabOverlayLayer
        containerRef={containerRef}
        vocabMap={vocabMap}
        showInlineTranslations={showInlineTranslations}
        activeBubble={bubble ? { word: bubble.word, translation: bubble.translation } : null}
      />

      {/* Multi-word selection → full highlights toolbar */}
      {hasSelection && !isSingleWord && !translationPopup.show && !explainPopup.show && (
        <SelectionToolbar
          rect={selection.rect}
          text={selection.text}
          containerRef={containerRef}
          onHighlight={handleHighlight}
          onTranslate={handleTranslate}
          onExplain={handleExplain}
          onSpeak={() => handleSpeak(selection.text)}
          onCopy={handleCopy}
        />
      )}

      {/* Single-word selection → WordPopup (phonetic, translation, definition, Remove). Save is automatic. */}
      {/* NOT gated on isSingleWord: clicking buttons inside the popup natively
          clears the document selection — keeping the popup mounted lets the user
          interact with it (lang picker, etc). Close paths: WordPopup's own
          click-outside / Escape / × / auto-dismiss, or selection growing to multi-word. */}
      {bubble && !translationPopup.show && (() => {
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
            lookupInfo={lookupState && lookupState.word === bubble.word
              ? { kind: lookupState.kind, tapsRemaining: lookupState.tapsRemaining }
              : null}
            onAddAnyway={lookupState && lookupState.word === bubble.word ? handleAddAnyway : undefined}
            addAnywayBusy={addAnywayBusy}
            saveInFlight={savingWord === bubble.word}
          />
        )
      })()}

      {translationPopup.show && (
        <TranslationPopup
          text={translationPopup.text}
          translatedText={translationPopup.translatedText}
          isLoading={translationPopup.isTranslating}
          error={translationPopup.error}
          sourceLang={translationPopup.sourceLang}
          targetLang={translationPopup.targetLang}
          languages={translationPopup.languages}
          rect={translationPopup.rect}
          containerRef={containerRef}
          onSourceLangChange={translationPopup.setSourceLang}
          onTargetLangChange={translationPopup.setTargetLang}
          onSpeak={handleSpeak}
          onClose={translationPopup.close}
        />
      )}

      {explainPopup.show && (
        <ExplanationPopup
          word={explainPopup.word}
          explanation={explainPopup.explanation}
          isLoading={explainPopup.isExplaining}
          error={explainPopup.error}
          rect={explainPopup.rect}
          containerRef={containerRef}
          onClose={explainPopup.close}
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

      {pendingToast && (
        <Toast
          message={pendingToast}
          duration={3500}
          onClose={() => setPendingToast(null)}
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
