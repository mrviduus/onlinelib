import { useAuth } from '../context/AuthContext'
import { useTranslation } from '../hooks/useTranslation'

export type PaywallTrigger = 'pages' | 'words' | 'practice'

interface SoftPaywallProps {
  trigger: PaywallTrigger
  onDismiss: () => void
}

const triggerIcons: Record<PaywallTrigger, string> = {
  pages: 'auto_stories',
  words: 'translate',
  practice: 'school',
}

export function SoftPaywall({ trigger, onDismiss }: SoftPaywallProps) {
  const { openAuthModal } = useAuth()
  const { t } = useTranslation()

  const handleSignIn = () => {
    openAuthModal()
    onDismiss()
  }

  return (
    <div className="soft-paywall-overlay" onClick={onDismiss}>
      <div className="soft-paywall" onClick={e => e.stopPropagation()}>
        <span className="material-icons-outlined soft-paywall__icon">{triggerIcons[trigger]}</span>
        <h2 className="soft-paywall__title">{t(`paywall.${trigger}Title`)}</h2>
        <p className="soft-paywall__text">{t(`paywall.${trigger}Text`)}</p>
        <div className="soft-paywall__actions">
          <button className="soft-paywall__btn-primary" onClick={handleSignIn}>
            {t('paywall.signIn')}
          </button>
          <button className="soft-paywall__btn-secondary" onClick={onDismiss}>
            {t('paywall.later')}
          </button>
        </div>
      </div>
    </div>
  )
}
