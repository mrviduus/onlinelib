import { useEffect, useState } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useTranslation } from '../../hooks/useTranslation'
import { useStudyBuddy } from '../../hooks/useStudyBuddy'
import type { StudyBuddyStep } from '../../api/studybuddy'

interface Props {
  open: boolean
  editionId: string
  passage: string
  chapterNumber: number | null
  isAuthenticated: boolean
  onSignIn: () => void
  onClose: () => void
}

/** One-line summary of an agent step for the (collapsed-by-default) transcript. */
function summarizeStep(step: StudyBuddyStep, t: (k: string) => string): string {
  const p = step.payload as { text?: string; tool?: string; ok?: boolean; toolCalls?: { name: string }[] }
  if (step.kind === 'tool_result')
    return `${p.tool ?? 'tool'} ${p.ok === false ? '✗' : '✓'}`
  if (p.toolCalls && p.toolCalls.length > 0)
    return `${t('reader.studyBuddy.calling')}: ${p.toolCalls.map(c => c.name).join(', ')}`
  const text = (p.text ?? '').trim()
  return text.length > 80 ? text.slice(0, 80) + '…' : text || t('reader.studyBuddy.thinking')
}

export function StudyBuddyPanel({
  open,
  editionId,
  passage,
  chapterNumber,
  isAuthenticated,
  onSignIn,
  onClose,
}: Props) {
  const { t } = useTranslation()
  const containerRef = useFocusTrap(open)
  const { status, steps, answer, error, run, reset } = useStudyBuddy(editionId)
  const [stepsExpanded, setStepsExpanded] = useState(false)

  // Start a run when the panel opens with a passage; reset when it closes.
  useEffect(() => {
    if (open && isAuthenticated && passage.trim()) run(passage, chapterNumber)
    if (!open) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, passage, chapterNumber, isAuthenticated])

  if (!open) return null

  return (
    <>
      <div className="reader-drawer-backdrop" onClick={onClose} />
      <div
        className="ask-panel"
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('reader.studyBuddy.title')}
      >
        <div className="ask-panel__header">
          <h3>{t('reader.studyBuddy.title')}</h3>
          <button onClick={onClose} className="ask-panel__close" aria-label={t('common.close')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="ask-panel__history">
          <p className="study-buddy__passage">{passage}</p>

          {!isAuthenticated ? (
            <div className="ask-panel__composer ask-panel__composer--signin">
              <p>{t('reader.studyBuddy.signIn')}</p>
              <button className="ask-panel__send" onClick={onSignIn}>
                {t('reader.studyBuddy.signInCta')}
              </button>
            </div>
          ) : (
            <>
              {answer && <p className="ask-panel__answer study-buddy__answer">{answer}</p>}

              {error && error !== 'auth' && <p className="ask-panel__error">{error}</p>}
              {error === 'auth' && <p className="ask-panel__error">{t('reader.studyBuddy.signIn')}</p>}

              {status === 'running' && (
                <div className="ask-panel__loading">
                  <span className="ask-panel__spinner" />
                  {t('reader.studyBuddy.thinking')}
                </div>
              )}

              {steps.length > 0 && (
                <div className="study-buddy__steps">
                  <button
                    className="study-buddy__steps-toggle"
                    onClick={() => setStepsExpanded(v => !v)}
                    aria-expanded={stepsExpanded}
                  >
                    {t('reader.studyBuddy.steps')} ({steps.length})
                  </button>
                  {stepsExpanded && (
                    <ol className="study-buddy__step-list">
                      {steps.map((s, i) => (
                        <li key={i} className={`study-buddy__step study-buddy__step--${s.kind}`}>
                          {summarizeStep(s, t)}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
