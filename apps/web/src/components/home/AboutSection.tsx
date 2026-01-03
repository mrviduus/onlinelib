import { useTranslation } from '../../hooks/useTranslation'

export function AboutSection() {
  const { t, tArray } = useTranslation()
  const points = tArray('home.about.points')

  return (
    <section className="home-about">
      <h2 className="home-about__title">{t('home.about.title')}</h2>
      <ul className="home-about__list">
        {points.map((point, i) => (
          <li key={i} className="home-about__item">{point}</li>
        ))}
      </ul>
    </section>
  )
}
