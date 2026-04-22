import { useEffect, useState } from 'react'
import { LocalizedLink } from './LocalizedLink'
import { useTranslation } from '../hooks/useTranslation'
import '../styles/cookie-banner.css'

const STORAGE_KEY = 'cookieConsent'
const AHREFS_KEY = '2oq1kt/zWCddxFtUBZPE9w'

type Choice = 'accepted' | 'rejected'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

function grantAnalytics() {
  window.gtag?.('consent', 'update', {
    analytics_storage: 'granted',
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
  })
  if (!document.querySelector('script[data-ahrefs]')) {
    const s = document.createElement('script')
    s.src = 'https://analytics.ahrefs.com/analytics.js'
    s.async = true
    s.dataset.key = AHREFS_KEY
    s.dataset.ahrefs = '1'
    document.head.appendChild(s)
  }
}

export function CookieBanner() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const choice = localStorage.getItem(STORAGE_KEY) as Choice | null
    if (choice === 'accepted') {
      grantAnalytics()
      return
    }
    if (choice === 'rejected') return
    setVisible(true)
  }, [])

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, 'accepted')
    grantAnalytics()
    setVisible(false)
  }

  const reject = () => {
    localStorage.setItem(STORAGE_KEY, 'rejected')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="cookie-banner" role="dialog" aria-labelledby="cookie-banner-title">
      <div className="cookie-banner__inner">
        <div className="cookie-banner__text">
          <strong id="cookie-banner-title">{t('cookieBanner.title')}</strong>
          <p>
            {t('cookieBanner.body')}{' '}
            <LocalizedLink to="/privacy">{t('cookieBanner.privacyLink')}</LocalizedLink>.
          </p>
        </div>
        <div className="cookie-banner__actions">
          <button type="button" className="cookie-banner__btn cookie-banner__btn--secondary" onClick={reject}>
            {t('cookieBanner.reject')}
          </button>
          <button type="button" className="cookie-banner__btn cookie-banner__btn--primary" onClick={accept}>
            {t('cookieBanner.accept')}
          </button>
        </div>
      </div>
    </div>
  )
}
