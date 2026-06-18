import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTranslation } from '../../hooks/useTranslation'
import { getConcepts, type ConceptCluster } from '../../api/vocabulary'

export function ConceptsSection() {
  const { isAuthenticated } = useAuth()
  const { t } = useTranslation()
  const [concepts, setConcepts] = useState<ConceptCluster[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return }

    getConcepts()
      .then(items => setConcepts(items))
      .catch(() => setConcepts([]))
      .finally(() => setLoading(false))
  }, [isAuthenticated])

  // While loading, render nothing — never block the page with a skeleton.
  if (loading) return null

  return (
    <section className="concepts-section">
      <h3 className="concepts-section__title">{t('stats.concepts.title')}</h3>

      {concepts.length === 0 ? (
        <p className="concepts-section__empty">{t('stats.concepts.empty')}</p>
      ) : (
        <div className="concepts-section__grid">
          {concepts.map(c => {
            const moreCount = c.memberCount - c.words.length
            return (
              <div key={c.id} className="concept-card">
                <div className="concept-card__title">{c.title}</div>
                {c.theme && <div className="concept-card__theme">{c.theme}</div>}
                <div className="concept-card__words">
                  {c.words.join(', ')}
                  {moreCount > 0 && (
                    <span className="concept-card__more">
                      {' '}{t('stats.concepts.more').replace('{count}', String(moreCount))}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
