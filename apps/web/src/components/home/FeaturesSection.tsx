import { useTranslation } from '../../hooks/useTranslation'

const FEATURES = [
  { key: 'translate', icon: '🔍' },
  { key: 'srs', icon: '🧠' },
  { key: 'upload', icon: '📖' },
  { key: 'stats', icon: '📊' },
  { key: 'offline', icon: '☁️' },
  { key: 'tts', icon: '🔊' },
] as const

export function FeaturesSection() {
  const { t } = useTranslation()

  return (
    <section className="home-features" aria-labelledby="home-features-heading">
      <div className="home-features__inner">
        <h2 className="home-features__heading" id="home-features-heading">
          {t('home.features.heading')}
        </h2>
        <p className="home-features__subheading">{t('home.features.subheading')}</p>
        <div className="home-features__grid">
          {FEATURES.map(f => (
            <article className="home-feature-card" key={f.key}>
              <div className="home-feature-card__icon" aria-hidden="true">{f.icon}</div>
              <h3 className="home-feature-card__title">{t(`home.features.${f.key}.title`)}</h3>
              <p className="home-feature-card__description">{t(`home.features.${f.key}.description`)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
