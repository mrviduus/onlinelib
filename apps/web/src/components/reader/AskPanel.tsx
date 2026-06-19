import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useTranslation } from '../../hooks/useTranslation'
import { useAsk } from '../../hooks/useAsk'
import { useRagIndex } from '../../hooks/useRagIndex'
import type { AskCitation } from '../../api/ask'
import type { RagIndexStatus } from '../../types/api'

interface Props {
  open: boolean
  editionId: string
  /** GUID of the chapter the user is actively reading — gates the RAG spoiler check. */
  currentChapterId?: string
  isAuthenticated: boolean
  /** Seed RAG index state from `publicBook` so the panel renders correctly with no extra fetch. */
  initialRagStatus?: RagIndexStatus
  initialChunkCount?: number
  initialEmbeddedCount?: number
  onSignIn: () => void
  onNavigateToCitation: (citation: AskCitation) => void
  onClose: () => void
}

export function AskPanel({
  open,
  editionId,
  currentChapterId,
  isAuthenticated,
  initialRagStatus,
  initialChunkCount,
  initialEmbeddedCount,
  onSignIn,
  onNavigateToCitation,
  onClose,
}: Props) {
  const { t } = useTranslation()
  const containerRef = useFocusTrap(open)
  const { history, isLoading, error, ask } = useAsk(editionId, currentChapterId)
  const { status, chunkCount, embeddedCount, preparing, prepare } = useRagIndex(
    editionId,
    initialRagStatus,
    initialChunkCount,
    initialEmbeddedCount,
  )
  const [input, setInput] = useState('')
  const historyRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the newest turn (scrollTop setter works in every environment).
  useEffect(() => {
    const el = historyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [history, isLoading])

  if (!open) return null

  const submit = () => {
    const q = input.trim()
    if (!q || isLoading) return
    ask(q)
    setInput('')
  }

  return (
    <>
      <div className="reader-drawer-backdrop" onClick={onClose} />
      <div className="ask-panel" ref={containerRef} role="dialog" aria-modal="true" aria-label={t('reader.ask.title')}>
        <div className="ask-panel__header">
          <h3>{t('reader.ask.title')}</h3>
          <button onClick={onClose} className="ask-panel__close" aria-label={t('common.close')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="ask-panel__history" ref={historyRef}>
          {history.length === 0 && !isLoading && (
            <p className="ask-panel__empty">{t('reader.ask.empty')}</p>
          )}
          {history.map((turn, i) => (
            <div key={i} className="ask-panel__turn">
              <p className="ask-panel__question">{turn.question}</p>
              <p className="ask-panel__answer">{turn.answer}</p>
              {turn.citations.length > 0 && (
                <div className="ask-panel__citations">
                  {turn.citations.map(c => (
                    <button
                      key={c.chunkId}
                      className="ask-panel__chip"
                      title={c.preview}
                      onClick={() => onNavigateToCitation(c)}
                    >
                      {t('reader.ask.citation', { ch: c.chapterOrd })}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="ask-panel__loading">
              <span className="ask-panel__spinner" />
              {t('reader.ask.thinking')}
            </div>
          )}
          {error && error !== 'auth' && <p className="ask-panel__error">{error}</p>}
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
            <textarea
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
            <button className="ask-panel__send" onClick={submit} disabled={isLoading || !input.trim()}>
              {t('reader.ask.send')}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
