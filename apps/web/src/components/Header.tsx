import { useState } from 'react'
import { LocalizedLink } from './LocalizedLink'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Search, MobileSearchOverlay } from './Search'
import { useSite } from '../context/SiteContext'
import { siteThemes, defaultTheme } from '../config/sites'

export function Header() {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const { site } = useSite()
  const theme = site?.siteCode ? siteThemes[site.siteCode] ?? defaultTheme : defaultTheme

  return (
    <header className="site-header">
      <LocalizedLink to="/" className="site-header__brand">
        <img src={theme.logo} alt={theme.name} className="site-header__logo" />
      </LocalizedLink>
      <Search />
      <button
        className="mobile-search-btn"
        onClick={() => setMobileSearchOpen(true)}
        aria-label="Search"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </button>
      <LanguageSwitcher />
      {mobileSearchOpen && <MobileSearchOverlay onClose={() => setMobileSearchOpen(false)} />}
    </header>
  )
}
