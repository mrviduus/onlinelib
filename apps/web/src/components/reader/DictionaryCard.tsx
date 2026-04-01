import { useEffect, useRef, useState } from 'react'
import type { DictionaryEntry } from '../../api/dictionary'
import { SpeakButton } from '../vocabulary/SpeakButton'

export type AutoSaveState = 'idle' | 'saving' | 'saved'

const STAGE_LABELS: Record<number, { label: string; className: string }> = {
  0: { label: 'New', className: 'vocab-stage--new' },
  1: { label: 'Learning ★1', className: 'vocab-stage--recognition' },
  2: { label: 'Learning ★2', className: 'vocab-stage--recall' },
  3: { label: 'Learning ★3', className: 'vocab-stage--context' },
  4: { label: 'Mastered ✓', className: 'vocab-stage--mastered' },
}

interface DictionaryCardProps {
  word: string
  entry: DictionaryEntry | null
  isLoading: boolean
  error: string | null
  rect: DOMRect | null
  containerRef: React.RefObject<HTMLElement | null>
  onExpand: () => void
  onSpeak?: (text: string) => void
  savedState: AutoSaveState
  isAuthenticated?: boolean
  vocabStage?: number | null
  onMarkKnown?: () => void
  onRemoveWord?: () => void
}

export function DictionaryCard({
  word,
  entry,
  isLoading,
  error,
  rect,
  containerRef,
  onExpand,
  onSpeak,
  savedState,
  isAuthenticated,
  vocabStage,
  onMarkKnown,
  onRemoveWord,
}: DictionaryCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!rect || !containerRef.current || !cardRef.current) {
      setPosition(null)
      return
    }

    const container = containerRef.current
    const containerRect = container.getBoundingClientRect()
    const card = cardRef.current
    const cardRect = card.getBoundingClientRect()

    let top = rect.bottom + 8
    let left = rect.left + rect.width / 2 - cardRect.width / 2

    const minLeft = containerRect.left + 8
    const maxLeft = containerRect.right - cardRect.width - 8
    left = Math.max(minLeft, Math.min(left, maxLeft))

    if (top + cardRect.height > window.innerHeight - 8) {
      top = rect.top - cardRect.height - 8
    }

    top = Math.max(8, Math.min(top, window.innerHeight - cardRect.height - 8))

    setPosition({ top, left })
  }, [rect, containerRef, entry, isLoading, error, savedState])

  if (!rect) return null

  const firstMeaning = entry?.definitions?.[0]
  const firstDef = firstMeaning?.definitions?.[0]

  return (
    <div
      ref={cardRef}
      className="dictionary-card"
      style={{
        position: 'fixed',
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        visibility: position ? 'visible' : 'hidden',
      }}
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.preventDefault()}
    >
      <div className="dictionary-card__header">
        {onSpeak && <SpeakButton onClick={() => onSpeak(word)} size={14} />}
        <span className="dictionary-card__word">{word}</span>
        {entry?.phonetic && (
          <span className="dictionary-card__phonetic">{entry.phonetic}</span>
        )}
        {vocabStage != null && STAGE_LABELS[vocabStage] && (
          <span className={`dictionary-card__stage ${STAGE_LABELS[vocabStage].className}`}>
            {STAGE_LABELS[vocabStage].label}
          </span>
        )}
        {isAuthenticated && (
          <span className={`dictionary-card__saved ${savedState === 'saved' ? 'dictionary-card__saved--visible' : ''}`}>
            <CheckIcon />
          </span>
        )}
        {!isAuthenticated && (
          <span className="dictionary-card__signin">Sign in to save</span>
        )}
      </div>

      {isLoading && (
        <div className="dictionary-card__loading">Looking up...</div>
      )}

      {error && (
        <div className="dictionary-card__loading">{error}</div>
      )}

      {entry && !isLoading && !error && (
        <div className="dictionary-card__body">
          {firstMeaning && (
            <div className="dictionary-card__pos">{firstMeaning.partOfSpeech}</div>
          )}
          {firstDef && (
            <>
              <div className="dictionary-card__def">{firstDef.definition}</div>
              {firstDef.example && (
                <div className="dictionary-card__example">"{firstDef.example}"</div>
              )}
            </>
          )}
        </div>
      )}

      {entry && !isLoading && (
        <div className="dictionary-card__footer">
          {onRemoveWord && (
            <button
              className="dictionary-card__remove-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onRemoveWord}
            >
              Remove ✕
            </button>
          )}
          {onMarkKnown && vocabStage != null && vocabStage < 4 && (
            <button
              className="dictionary-card__know-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onMarkKnown}
            >
              I know this ✓
            </button>
          )}
          <button
            className="dictionary-card__expand"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onExpand}
          >
            More &#9656;
          </button>
        </div>
      )}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
