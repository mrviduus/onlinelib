import { useSite } from '../context/SiteContext'
import { getSiteTheme } from '../config/sites'
import { LocalizedLink } from './LocalizedLink'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Search } from './Search'

export function Header() {
  const { site } = useSite()
  const theme = getSiteTheme(site?.siteCode || 'default')

  return (
    <header className="site-header">
      <LocalizedLink to="/" className="site-header__brand">
        <img
          src={theme.logo}
          alt={theme.name}
          className="site-header__logo"
        />
      </LocalizedLink>
      <Search />
      <LanguageSwitcher />
    </header>
  )
}
