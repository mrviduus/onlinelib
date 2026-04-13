import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useGuestLimits } from '../context/GuestLimitsContext'
import { useTranslation } from '../hooks/useTranslation'

export function GuestBanner() {
  const { isAuthenticated, isLoading, isGuest, openAuthModal } = useAuth()
  const { shouldShowNag } = useGuestLimits()
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(false)

  if (isLoading) return null

  // Guest + enough engagement → nag upgrade-CTA.
  if (isAuthenticated && isGuest && shouldShowNag && !dismissed) {
    return (
      <div className="guest-banner guest-banner--nag">
        <span className="guest-banner__text">{t('guestBanner.nagMessage')}</span>
        <button className="guest-banner__link" onClick={openAuthModal}>
          {t('guestBanner.signUp')}
        </button>
        <button
          className="guest-banner__link guest-banner__link--muted"
          onClick={() => setDismissed(true)}
          aria-label={t('guestBanner.notNow')}
        >
          {t('guestBanner.notNow')}
        </button>
      </div>
    )
  }

  // Anonymous users — существующий banner.
  if (!isAuthenticated) {
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

  return null
}
