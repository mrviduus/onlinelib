import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '../../hooks/useTranslation'

const TESTIMONIALS = [
  {
    key: 'reader1',
    avatar: '📚',
  },
  {
    key: 'reader2',
    avatar: '🎓',
  },
  {
    key: 'reader3',
    avatar: '🌍',
  },
  {
    key: 'reader4',
    avatar: '✨',
  },
  {
    key: 'reader5',
    avatar: '🧠',
  },
] as const

export function TestimonialsSection() {
  const { t } = useTranslation()
  const [active, setActive] = useState(0)
  const total = TESTIMONIALS.length

  const next = useCallback(() => setActive(i => (i + 1) % total), [total])
  const prev = useCallback(() => setActive(i => (i - 1 + total) % total), [total])

  useEffect(() => {
    const id = setInterval(next, 6000)
    return () => clearInterval(id)
  }, [next])

  return (
    <section className="home-testimonials" aria-labelledby="home-testimonials-heading">
      <div className="home-testimonials__inner">
        <h2 className="home-testimonials__heading" id="home-testimonials-heading">
          {t('home.testimonials.heading')}
        </h2>
        <p className="home-testimonials__subheading">{t('home.testimonials.subheading')}</p>

        <div className="home-testimonials__carousel" role="region" aria-roledescription="carousel" aria-label="Testimonials">
          <div className="home-testimonials__track">
            {TESTIMONIALS.map((item, i) => (
              <blockquote
                key={item.key}
                className={`home-testimonial-card${i === active ? ' home-testimonial-card--active' : ''}`}
                aria-hidden={i !== active}
              >
                <p className="home-testimonial-card__quote">
                  "{t(`home.testimonials.${item.key}.quote`)}"
                </p>
                <footer className="home-testimonial-card__footer">
                  <span className="home-testimonial-card__avatar" aria-hidden="true">{item.avatar}</span>
                  <div className="home-testimonial-card__meta">
                    <cite className="home-testimonial-card__name">
                      {t(`home.testimonials.${item.key}.name`)}
                    </cite>
                    <span className="home-testimonial-card__role">
                      {t(`home.testimonials.${item.key}.role`)}
                    </span>
                  </div>
                </footer>
              </blockquote>
            ))}
          </div>

          <div className="home-testimonials__controls">
            <button className="home-testimonials__arrow" onClick={prev} aria-label="Previous testimonial">
              ‹
            </button>
            <div className="home-testimonials__dots" role="tablist">
              {TESTIMONIALS.map((item, i) => (
                <button
                  key={item.key}
                  className={`home-testimonials__dot${i === active ? ' home-testimonials__dot--active' : ''}`}
                  onClick={() => setActive(i)}
                  role="tab"
                  aria-selected={i === active}
                  aria-label={`Testimonial ${i + 1}`}
                />
              ))}
            </div>
            <button className="home-testimonials__arrow" onClick={next} aria-label="Next testimonial">
              ›
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
