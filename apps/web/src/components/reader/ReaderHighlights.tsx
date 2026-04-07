import { useRef, useCallback, useState, useEffect } from 'react'
import { useTextSelection } from '../../hooks/useTextSelection'
import { useHighlights } from '../../hooks/useHighlights'
import { useTextTranslation } from '../../hooks/useTextTranslation'
import { useNativeLanguage } from '../../context/NativeLanguageContext'
import { useTts } from '../../hooks/useTts'
import { useTranslation } from '../../hooks/useTranslation'
import { useWordTap } from '../../hooks/useWordTap'
import { createTextAnchor, findTextByAnchor } from '../../lib/textAnchor'
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

/** Resolve target language for translation: native lang, or flip if same as book */
function resolveTargetLang(nativeLang: string, bookLang: string): string {
  if (nativeLang !== bookLang) return nativeLang
  return bookLang === 'uk' ? 'en' : 'uk'
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
  scrollToHighlightId,
  showInlineTranslations = false,
  children,
}: ReaderHighlightsProps) {
  const { nativeLanguage } = useNativeLanguage()
  const { t } = useTranslation()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const targetLang = resolveTargetLang(nativeLanguage, bookLanguage)

  // --- Text selection ---
  const { selection, clearSelection, hasSelection } = useTextSelection(containerRef)

  // --- Word tap popup ---
  const {
    tap, close: closeTapPopup, vocabEntry: tappedVocabEntry,
    vocabMap, markKnown: handleTapMarkKnown, remove: handleTapRemove,
  } = useWordTap({
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
  })

  // Close tap popup when selection starts
  useEffect(() => {
    if (hasSelection && tap.word) closeTapPopup()
  }, [hasSelection, tap.word, closeTapPopup])

  // Auto-play TTS when word is tapped
  useEffect(() => {
    if (tap.word) handleSpeak(tap.word)
  }, [tap.word]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Highlights ---
  const {
    highlights, addHighlight, updateHighlight, removeHighlight,
  } = useHighlights(userBookId ? undefined : editionId, userBookId, {
    chapterId,
    isAuthenticated,
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

      {hasSelection && !showTranslation && (
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

      {tap.word && !hasSelection && !showTranslation && (
        <WordPopup
          word={tap.word}
          phonetic={tap.phonetic}
          translation={tap.translation}
          translationLoading={tap.translationLoading}
          definition={tap.definition}
          definitionLoading={tap.definitionLoading}
          rect={tap.rect}
          containerRef={containerRef}
          onSpeak={() => handleSpeak(tap.word!)}
          onMarkKnown={tappedVocabEntry?.id ? handleTapMarkKnown : undefined}
          onRemove={tappedVocabEntry?.id ? handleTapRemove : undefined}
          onClose={closeTapPopup}
          vocabStage={tappedVocabEntry?.stage ?? null}
          t={t}
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
