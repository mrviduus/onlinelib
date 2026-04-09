import { useTranslation } from '../../hooks/useTranslation'

interface MicroPracticePromptProps {
  visible: boolean
  onAccept: () => void
  onDismiss: () => void
}

export function MicroPracticePrompt({ visible, onAccept, onDismiss }: MicroPracticePromptProps) {
  const { t } = useTranslation()

  if (!visible) return null

  return (
    <div className="micro-prompt">
      <div className="micro-prompt__card">
        <span className="material-icons-outlined micro-prompt__icon">quiz</span>
        <h3 className="micro-prompt__title">{t('onboarding.promptTitle')}</h3>
        <p className="micro-prompt__body">{t('onboarding.promptBody')}</p>
        <div className="micro-prompt__actions">
          <button className="micro-prompt__btn micro-prompt__btn--dismiss" onClick={onDismiss}>
            {t('onboarding.promptDismiss')}
          </button>
          <button className="micro-prompt__btn micro-prompt__btn--accept" onClick={onAccept}>
            {t('onboarding.promptAccept')}
          </button>
        </div>
      </div>
    </div>
  )
}
