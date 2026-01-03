import { useTranslation } from '../../hooks/useTranslation'
import { LocalizedLink } from '../LocalizedLink'

export function HeroSection() {
  const { t } = useTranslation()

  return (
    <section className="home-hero">
      <h1 className="home-hero__title">{t('home.hero.title')}</h1>
      <p className="home-hero__subtitle">{t('home.hero.subtitle')}</p>
      <LocalizedLink to="/books" className="home-hero__cta">
        {t('home.hero.cta')}
      </LocalizedLink>
    </section>
  )
}
