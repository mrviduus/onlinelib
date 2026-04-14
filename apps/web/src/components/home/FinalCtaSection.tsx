import { LocalizedLink } from '../LocalizedLink'
import { useTranslation } from '../../hooks/useTranslation'

export function FinalCtaSection() {
  const { t } = useTranslation()

  return (
    <section className="home-final-cta" aria-labelledby="home-final-cta-heading">
      <div className="home-final-cta__inner">
        <h2 className="home-final-cta__heading" id="home-final-cta-heading">
          {t('home.finalCta.heading')}
        </h2>
        <p className="home-final-cta__body">{t('home.finalCta.body')}</p>
        <LocalizedLink to="/books" className="home-final-cta__button">
          {t('home.finalCta.button')}
        </LocalizedLink>
      </div>
    </section>
  )
}
