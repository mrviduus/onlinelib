import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from '../../hooks/useTranslation'
import { useLanguage } from '../../context/LanguageContext'
import { useAuth } from '../../context/AuthContext'
import { useGuestLimits } from '../../context/GuestLimitsContext'
import { DEMO_BOOK } from '../../config/demoBook'
import { MobileSearchOverlay } from '../Search'
import { LocalizedLink } from '../LocalizedLink'

export function HeroSection() {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const { isAuthenticated } = useAuth()
  const { isReturningUser, guestState } = useGuestLimits()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      navigate(`/${language}/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  const handleInputFocus = () => {
    if (isMobile) {
      setSearchOverlayOpen(true)
    }
  }

  const showGuestCta = !isAuthenticated
  const demoPath = `/books/${DEMO_BOOK.bookSlug}/${DEMO_BOOK.chapterSlug}`
  const returningPath = guestState.currentBook
    ? `/books/${guestState.currentBook.bookSlug}/${guestState.currentBook.chapterSlug}`
    : demoPath

  return (
    <section className="home-hero">
      <div className="home-hero__content">
        <h1 className="home-hero__title">{t('home.hero.title')}</h1>
        <p className="home-hero__subtitle">
          {showGuestCta ? t('home.hero.subtitleDemo') : t('home.hero.subtitle')}
        </p>

        {showGuestCta && (
          <div className="home-hero__cta-group">
            <LocalizedLink
              to={isReturningUser ? returningPath : demoPath}
              className={`home-hero__cta-primary${!isReturningUser ? ' home-hero__cta-primary--pulse' : ''}`}
            >
              {isReturningUser ? t('home.hero.ctaReturning') : t('home.hero.ctaPrimary')}
            </LocalizedLink>
            <LocalizedLink to="/library" className="home-hero__cta-secondary">
              {t('home.hero.ctaSecondary')}
            </LocalizedLink>
          </div>
        )}

        <form className="home-hero__search" onSubmit={handleSearch}>
          <span className="material-icons-outlined home-hero__search-icon">search</span>
          <input
            type="text"
            className="home-hero__search-input"
            placeholder={t('home.hero.searchPlaceholder') || 'Search by title, author, or genre...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={handleInputFocus}
            readOnly={isMobile}
          />
        </form>
      </div>
      {searchOverlayOpen && <MobileSearchOverlay onClose={() => setSearchOverlayOpen(false)} />}
    </section>
  )
}
