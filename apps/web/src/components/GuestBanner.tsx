import { useAuth } from '../context/AuthContext'
import { useTranslation } from '../hooks/useTranslation'

export function GuestBanner() {
  const { isAuthenticated, isLoading, openAuthModal } = useAuth()
  const { t } = useTranslation()

  if (isLoading || isAuthenticated) return null

  return (
    <div className="guest-banner">
      <span className="guest-banner__text">{t('guestBanner.message')}</span>
      <button className="guest-banner__link" onClick={openAuthModal}>
        {t('guestBanner.signIn')}
      </button>
      <span className="guest-banner__text">{t('guestBanner.suffix')}</span>
    </div>
  )
}
