import { useState, useRef } from 'react'
import { LocalizedLink } from './LocalizedLink'
import { DiscoverMenu } from './DiscoverMenu'
import { LoginButton } from './auth/LoginButton'
import { UserMenu } from './auth/UserMenu'
import { useAuth } from '../context/AuthContext'
import { useScrolled } from '../hooks/useScrolled'
import { useDarkMode } from '../hooks/useDarkMode'
import { useTranslation } from '../hooks/useTranslation'
import { useQuickStats } from '../hooks/useQuickStats'
import { StreakBadge } from './StreakBadge'
import { VocabBadgePopup } from './VocabBadgePopup'
import { UploadButton } from './library/UploadButton'

export function Header() {
  const [badgePopup, setBadgePopup] = useState(false)
  const badgeWrapperRef = useRef<HTMLDivElement>(null)
  const { isAuthenticated, isLoading } = useAuth()
  const isScrolled = useScrolled(50)
  const { isDark, toggleTheme } = useDarkMode()
  const { t } = useTranslation()
  const quickStats = useQuickStats()

  return (
    <header className={`site-header ${isScrolled ? 'site-header--scrolled' : ''}`}>
      <div className="site-header__left">
        <LocalizedLink to="/" className="site-header__brand" title={t('nav.brandTitle')}>
          <span className="site-header__wordmark">TextStack</span>
        </LocalizedLink>
        <nav className="site-header__nav-links">
          <DiscoverMenu />
          <LocalizedLink to="/vocabulary" className="site-header__nav-link" title={t('nav.vocabulary')}>
            {t('nav.vocabulary')}
          </LocalizedLink>
          <LocalizedLink to="/about" className="site-header__nav-link site-header__nav-link--secondary" title={t('nav.aboutTextStack')}>
            {t('nav.about')}
          </LocalizedLink>
        </nav>
      </div>
      <div className="site-header__right">
        <UploadButton />
        <button
          className="site-header__icon-btn"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span className="material-icons-outlined">{isDark ? 'light_mode' : 'dark_mode'}</span>
        </button>
        {isAuthenticated && quickStats && (quickStats.vocabDueNow > 0 || quickStats.vocabReviewedToday > 0) && (
          <div className="streak-badge-wrapper" ref={badgeWrapperRef}>
            <button
              className="streak-badge"
              onClick={() => setBadgePopup(v => !v)}
              title={t('nav.vocabulary')}
            >
              <StreakBadge
                reviewed={quickStats.vocabReviewedToday}
                due={quickStats.vocabDueNow}
                streak={quickStats.vocabStreak}
              />
            </button>
            {badgePopup && (
              <VocabBadgePopup
                reviewed={quickStats.vocabReviewedToday}
                due={quickStats.vocabDueNow}
                streak={quickStats.vocabStreak}
                containerRef={badgeWrapperRef}
                onClose={() => setBadgePopup(false)}
              />
            )}
          </div>
        )}
        {!isLoading && (isAuthenticated ? <UserMenu /> : <LoginButton />)}
      </div>
    </header>
  )
}
