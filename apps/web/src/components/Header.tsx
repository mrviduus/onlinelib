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
import { features } from '../lib/features'
import { emit } from '../lib/telemetry/myBooksV3'

export function Header() {
  const [badgePopup, setBadgePopup] = useState(false)
  const badgeWrapperRef = useRef<HTMLDivElement>(null)
  const { isAuthenticated, isLoading } = useAuth()
  const isScrolled = useScrolled(50)
  const { isDark, toggleTheme } = useDarkMode()
  const { t } = useTranslation()
  const quickStats = useQuickStats()

  const v3 = features.myBooksV3.headerReframe
  // /home doesn't exist until slice 03 — fall back to /library.
  const homeTarget = '/library'

  return (
    <header className={`site-header ${isScrolled ? 'site-header--scrolled' : ''}`}>
      <div className="site-header__left">
        <LocalizedLink
          to={v3 && isAuthenticated ? homeTarget : '/'}
          className="site-header__brand"
          title={t('nav.brandTitle')}
          onClick={() => v3 && emit('header.click', { item: 'logo', auth: isAuthenticated })}
        >
          <span className="site-header__wordmark">TextStack</span>
        </LocalizedLink>
        <nav className="site-header__nav-links">
          {v3 ? (
            <>
              {isAuthenticated && (
                <LocalizedLink
                  to={homeTarget}
                  className="site-header__nav-link"
                  title={t('nav.home')}
                  onClick={() => emit('header.click', { item: 'home' })}
                >
                  {t('nav.home')}
                </LocalizedLink>
              )}
              {isAuthenticated && (
                <LocalizedLink
                  to="/library"
                  className="site-header__nav-link"
                  title={t('nav.library')}
                  onClick={() => emit('header.click', { item: 'library' })}
                >
                  {t('nav.library')}
                </LocalizedLink>
              )}
              <DiscoverMenu />
              {isAuthenticated && (
                <LocalizedLink
                  to="/vocabulary"
                  className="site-header__nav-link"
                  title={t('nav.vocabulary')}
                  onClick={() => emit('header.click', { item: 'vocabulary' })}
                >
                  {t('nav.vocabulary')}
                </LocalizedLink>
              )}
              {!isAuthenticated && (
                <LocalizedLink
                  to="/about"
                  className="site-header__nav-link site-header__nav-link--secondary"
                  title={t('nav.aboutTextStack')}
                >
                  {t('nav.about')}
                </LocalizedLink>
              )}
            </>
          ) : (
            <>
              <DiscoverMenu />
              <LocalizedLink to="/vocabulary" className="site-header__nav-link" title={t('nav.vocabulary')}>
                {t('nav.vocabulary')}
              </LocalizedLink>
              <LocalizedLink to="/about" className="site-header__nav-link site-header__nav-link--secondary" title={t('nav.aboutTextStack')}>
                {t('nav.about')}
              </LocalizedLink>
            </>
          )}
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
