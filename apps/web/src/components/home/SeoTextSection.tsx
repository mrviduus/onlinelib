import { useTranslation } from '../../hooks/useTranslation'

export function SeoTextSection() {
  const { t } = useTranslation()

  return (
    <section className="home-seo">
      <p className="home-seo__text">{t('home.seo.content')}</p>
    </section>
  )
}
