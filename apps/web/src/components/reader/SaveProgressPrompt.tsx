import { useTranslation } from '../../hooks/useTranslation'

interface SaveProgressPromptProps {
  visible: boolean
  onAccept: () => void
  onDismiss: () => void
}

export function SaveProgressPrompt({ visible, onAccept, onDismiss }: SaveProgressPromptProps) {
  const { t } = useTranslation()

  if (!visible) return null

  return (
    <div className="save-progress-prompt">
      <div className="save-progress-prompt__card">
        <span className="material-icons-outlined save-progress-prompt__icon">bookmark</span>
        <h3 className="save-progress-prompt__title">{t('onboarding.saveProgressTitle')}</h3>
        <p className="save-progress-prompt__body">{t('onboarding.saveProgressBody')}</p>
        <div className="save-progress-prompt__actions">
          <button className="save-progress-prompt__btn save-progress-prompt__btn--dismiss" onClick={onDismiss}>
            {t('onboarding.saveProgressDismiss')}
          </button>
          <button className="save-progress-prompt__btn save-progress-prompt__btn--accept" onClick={onAccept}>
            {t('onboarding.saveProgressAccept')}
          </button>
        </div>
      </div>
    </div>
  )
}
