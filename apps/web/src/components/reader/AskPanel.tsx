import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useTranslation } from '../../hooks/useTranslation'
import { useBookChat } from '../../hooks/useBookChat'
import { useRagIndex } from '../../hooks/useRagIndex'
import { composeQuotedQuestion, parseQuotedContent } from '../../api/bookChat'
import { AskMarkdown } from './AskMarkdown'
import type { AskCitation, AskTarget } from '../../api/ask'
import { citationLabel as sharedCitationLabel } from '@textstack/shared'

/** A passage attached to the composer via "Ask about this" (nonce forces re-attach on re-select). */
export interface AskPrefill {
  text: string
  nonce: number
}

interface Props {
  open: boolean
  /**
   * What this panel asks against (AI-027 P2). Carries the kind (catalog edition vs user upload),
   * the id, and the seeded RAG index state/counts so the panel renders correctly with no extra
   * fetch and routes status/prepare/ask through the right endpoints.
   */
  askTarget: AskTarget
  /** GUID of the chapter the user is actively reading — gates the RAG spoiler check. */
  currentChapterId?: string
  /** Passage handed in from the reader selection ("Ask about this") — attached as a quote card. */
  prefill?: AskPrefill | null
  isAuthenticated: boolean
  onSignIn: () => void
  onNavigateToCitation: (citation: AskCitation) => void
  /** The book's chapters, so a citation chip can name the chapter instead of printing its ordinal. */
  chapters?: { chapterNumber?: number; title?: string }[]
  onClose: () => void
}

/** Styled blockquote card for a quoted passage (in the composer and in sent user turns). */
function QuoteCard({ text, onDetach, detachLabel }: { text: string; onDetach?: () => void; detachLabel?: string }) {
  return (
    <div className="ask-panel__quote">
      <span className="ask-panel__quote-bar" aria-hidden="true" />
      <p className="ask-panel__quote-text">{text}</p>
      {onDetach && (
        <button type="button" className="ask-panel__quote-detach" onClick={onDetach} aria-label={detachLabel} title={detachLabel}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

export function AskPanel({
  open,
  askTarget,
  currentChapterId,
  prefill,
  isAuthenticated,
  onSignIn,
  onNavigateToCitation,
  chapters,
  onClose,
}: Props) {
  const { t } = useTranslation()
  const containerRef = useFocusTrap(open)
  const { history, isLoading, error, ask, historyLoading, spoilerGateEnabled, setSpoilerGate, clearChat } =
    useBookChat(askTarget, currentChapterId, open && isAuthenticated)
  const { status, chunkCount, embeddedCount, preparing, prepare } = useRagIndex(askTarget)
  const [input, setInput] = useState('')
  const [quote, setQuote] = useState<string | null>(null)
  const historyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to the newest turn (scrollTop setter works in every environment).
  useEffect(() => {
    const el = historyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [history, isLoading, historyLoading])

  // Attach a selected passage as a quote card + focus the (empty) input for the question.
  useEffect(() => {
    if (!prefill) return
    setQuote(prefill.text)
    const el = inputRef.current
    if (el) el.focus()
  }, [prefill?.nonce])

  if (!open) return null

  const submit = () => {
    const q = input.trim()
    if ((!q && !quote) || isLoading) return
    ask(quote ? composeQuotedQuestion(quote, q) : q)
    setInput('')
    setQuote(null)
  }

  const submitStarter = (q: string) => {
    if (isLoading) return
    ask(q)
  }

  const handleClear = () => {
    if (isLoading) return
    if (window.confirm(t('reader.ask.clearConfirm'))) clearChat()
  }

  // Subtle for user uploads (there's no spoiler concern on the reader's own document, but the gate
  // is offered for consistency, default off); prominent for catalog books.
  const spoilerSubtle = askTarget.kind === 'userbook'

  // Human-readable label for a citation — shared by the chips below the answer and the inline [n]
  // marker tooltips inside the rendered markdown. It printed `ch.{chapterOrd}` and so said "ch.0" for
  // the first chapter, an internal 0-based index no other reader surface shows; the shared helper
  // prefers the chapter's real title and carries the marker. Not translated, because what it renders
  // is a title, a page number or an ordinal — see packages/shared/src/reader/citation.ts.
  const label = (c: AskCitation) => sharedCitationLabel(c, chapters)

  // Suggested starter questions, shown only on an empty, Ready thread once history has loaded.
  const starterKeys = ['summary', 'characters', 'keyIdea', 'attention'] as const
  const showStarters =
    history.length === 0 && !historyLoading && status === 'Ready' && isAuthenticated && !isLoading

  return (
    <>
      <div className="reader-drawer-backdrop" onClick={onClose} />
      <div className="ask-panel" ref={containerRef} role="dialog" aria-modal="true" aria-label={t('reader.ask.title')}>
        <div className="ask-panel__header">
          <h3>{t('reader.ask.title')}</h3>
          <div className="ask-panel__header-actions">
            {isAuthenticated && (
              <label
                className={`ask-panel__spoiler${spoilerSubtle ? ' ask-panel__spoiler--subtle' : ''}`}
                title={t('reader.ask.spoilerTooltip')}
              >
                <input
                  type="checkbox"
                  checked={spoilerGateEnabled}
                  onChange={e => setSpoilerGate(e.target.checked)}
                />
                <span>{t('reader.ask.spoilerToggle')}</span>
              </label>
            )}
            {isAuthenticated && history.length > 0 && (
              <button
                type="button"
                className="ask-panel__clear"
                onClick={handleClear}
                title={t('reader.ask.clearChat')}
                aria-label={t('reader.ask.clearChat')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </button>
            )}
            <button onClick={onClose} className="ask-panel__close" aria-label={t('common.close')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="ask-panel__history" ref={historyRef}>
          {historyLoading ? (
            <div className="ask-panel__skeleton" aria-label={t('reader.ask.loadingHistory')}>
              <span className="ask-panel__skeleton-line" />
              <span className="ask-panel__skeleton-line" />
              <span className="ask-panel__skeleton-line" />
            </div>
          ) : (
            <>
              {history.length === 0 && !isLoading && (
                <p className="ask-panel__empty">{t('reader.ask.empty')}</p>
              )}
              {showStarters && (
                <div className="ask-panel__starters">
                  <p className="ask-panel__starters-title">{t('reader.ask.startersTitle')}</p>
                  {starterKeys.map(key => (
                    <button
                      key={key}
                      type="button"
                      className="ask-panel__starter"
                      onClick={() => submitStarter(t(`reader.ask.starters.${key}`))}
                    >
                      {t(`reader.ask.starters.${key}`)}
                    </button>
                  ))}
                </div>
              )}
              {history.map((turn, i) => {
                const parsed = parseQuotedContent(turn.question)
                return (
                  <div key={i} className="ask-panel__turn">
                    {parsed.quote && <QuoteCard text={parsed.quote} />}
                    {parsed.text && <p className="ask-panel__question">{parsed.text}</p>}
                    {turn.answer && (
                      <div className="ask-panel__answer">
                        <AskMarkdown
                          text={turn.answer}
                          citations={turn.citations}
                          onNavigateToCitation={onNavigateToCitation}
                          citationTitle={label}
                        />
                        {turn.streaming && <span className="ask-panel__cursor" aria-hidden="true" />}
                      </div>
                    )}
                    {turn.streaming && !turn.answer && (
                      <div className="ask-panel__loading">
                        <span className="ask-panel__spinner" />
                        {t('reader.ask.thinking')}
                      </div>
                    )}
                    {!turn.streaming && turn.citations.length > 0 && (
                      <div className="ask-panel__citations">
                        {turn.citations.map(c => (
                          <button
                            key={c.chunkId}
                            className="ask-panel__chip"
                            // PDF citations carry a section path — surface it as the tooltip;
                            // otherwise fall back to the passage preview.
                            title={c.sectionPath || c.preview}
                            onClick={() => onNavigateToCitation(c)}
                          >
                            {label(c)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {error && error !== 'auth' && <p className="ask-panel__error">{error}</p>}
            </>
          )}
        </div>

        {!isAuthenticated ? (
          <div className="ask-panel__composer ask-panel__composer--signin">
            <p>{t('reader.ask.signIn')}</p>
            <button className="ask-panel__send" onClick={onSignIn}>
              {t('reader.ask.signInCta')}
            </button>
          </div>
        ) : status === 'Indexing' ? (
          <div className="ask-panel__composer ask-panel__composer--prepare">
            <p className="ask-panel__preparing">
              {t('reader.ask.preparing', { done: embeddedCount, total: chunkCount })}
            </p>
            <div className="ask-panel__progress" role="progressbar" aria-valuemin={0} aria-valuemax={chunkCount || 1} aria-valuenow={embeddedCount}>
              <span
                className="ask-panel__progress-bar"
                style={{ width: `${chunkCount > 0 ? Math.round((embeddedCount / chunkCount) * 100) : 0}%` }}
              />
            </div>
          </div>
        ) : status === 'Failed' ? (
          <div className="ask-panel__composer ask-panel__composer--prepare">
            <p className="ask-panel__error">{t('reader.ask.indexFailed')}</p>
            <button className="ask-panel__send" onClick={prepare} disabled={preparing}>
              {t('reader.ask.indexRetry')}
            </button>
          </div>
        ) : status !== 'Ready' ? (
          <div className="ask-panel__composer ask-panel__composer--prepare">
            <p className="ask-panel__prepare-copy">{t('reader.ask.prepareCopy')}</p>
            <button className="ask-panel__send" onClick={prepare} disabled={preparing}>
              {t('reader.ask.prepareCta')}
            </button>
          </div>
        ) : (
          <div className="ask-panel__composer">
            {error === 'auth' && <p className="ask-panel__error">{t('reader.ask.signIn')}</p>}
            {quote && (
              <QuoteCard text={quote} onDetach={() => setQuote(null)} detachLabel={t('reader.ask.detachQuote')} />
            )}
            <textarea
              ref={inputRef}
              className="ask-panel__input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={t('reader.ask.placeholder')}
              rows={2}
            />
            <button className="ask-panel__send" onClick={submit} disabled={isLoading || (!input.trim() && !quote)}>
              {t('reader.ask.send')}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
