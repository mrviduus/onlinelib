import { useEffect, useState } from 'react'
import type { ReviewCardDto, SubmitReviewResponse } from '../../api/vocabulary'
import { lookupWord } from '../../api/dictionary'
import type { DictionaryEntry } from '../../api/dictionary'
import { SpeakButton } from './SpeakButton'

interface Props {
  card: ReviewCardDto
  result: SubmitReviewResponse
  isCorrect: boolean
  onSpeak?: (text: string) => void
  t: (key: string) => string
  onNext: () => void
  language: string
}

function formatDefinition(entry: DictionaryEntry): string | null {
  if (!entry.definitions?.length) return null

  const parts: string[] = []
  for (const meaning of entry.definitions.slice(0, 3)) {
    if (!meaning.partOfSpeech) continue
    const defs = meaning.definitions?.slice(0, 2)
    if (!defs?.length) continue
    const pos = meaning.partOfSpeech.charAt(0).toUpperCase() + meaning.partOfSpeech.slice(1)
    const defTexts = defs.map((d, i) => `${i + 1}. ${d.definition}`).join(' ')
    parts.push(`${pos}: ${defTexts}`)
  }

  return parts.length > 0 ? parts.join('\n') : null
}

export function ReviewFeedback({ card, result, isCorrect, onSpeak, t, onNext, language }: Props) {
  const stageName = (stage: number) => t(`vocabulary.stages.${stage}`) || `Stage ${stage}`
  const [fetchedDef, setFetchedDef] = useState<string | null>(null)

  useEffect(() => {
    if (card.definition) return
    lookupWord(language, card.word)
      .then(entry => setFetchedDef(formatDefinition(entry)))
      .catch(() => {})
  }, [card.word, card.definition, language])

  const definition = card.definition || fetchedDef

  return (
    <div className={`review-feedback review-feedback--${isCorrect ? 'correct' : 'wrong'}`}>
      <div className="review-feedback__badge">
        <span className="review-feedback__icon">{isCorrect ? '✓' : '✗'}</span>
        <span className="review-feedback__message">
          {isCorrect ? t('vocabulary.review.correct') : t('vocabulary.review.wrong')}
        </span>
      </div>

      <div className="review-feedback__body">
        <div className="review-feedback__word-row">
          {onSpeak && <SpeakButton onClick={() => onSpeak(card.word)} size={18} />}
          <span className="review-feedback__word">{card.word}</span>
          {card.translation && (
            <span className="review-feedback__translation">— {card.translation}</span>
          )}
        </div>

        {!isCorrect && (
          <div className="review-feedback__answer">
            <span className="review-feedback__label">{t('vocabulary.review.correctAnswer')}:</span>{' '}
            <span className="review-feedback__correct-word">{card.word}</span>
          </div>
        )}

        {card.originalSentence && (
          <p className="review-feedback__sentence">
            {card.originalSentence}
            {card.bookTitle && <span className="review-feedback__book"> — {card.bookTitle}</span>}
          </p>
        )}

        {definition && (
          <p className="review-feedback__definition">{definition}</p>
        )}

        {result.stageChanged && (
          <div className="review-feedback__stage">
            {stageName(result.previousStage)} → {stageName(result.newStage)}
          </div>
        )}
      </div>

      <button className="review-feedback__next" onClick={onNext}>
        {t('vocabulary.review.next')}
      </button>
    </div>
  )
}
