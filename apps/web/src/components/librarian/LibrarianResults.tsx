import type { LibrarianResponse } from '../../api/librarian'
import { LibrarianRecommendationCard } from './LibrarianRecommendationCard'

interface Props {
  response: LibrarianResponse
  t: (key: string, vars?: Record<string, string | number>) => string
}

// The showcase: surfaces the librarian's REASONING as a deliberate "here's what I found and why" view, then
// the ranked, grounded recommendation cards. `reasoning` is untrusted model text — React-escaped + clamped.
export function LibrarianResults({ response, t }: Props) {
  const { reasoning, recommendations, usedExternal } = response
  return (
    <div className="librarian-results">
      <div className="librarian-results__reasoning">
        <span className="librarian-results__reasoning-label">{t('librarian.reasoningLabel')}</span>
        <p className="librarian-results__reasoning-text tutor-clamp tutor-clamp--4">{reasoning}</p>
      </div>

      {usedExternal && (
        <div className="librarian-results__external-note">
          <span className="librarian-results__external-icon" aria-hidden>🌐</span>
          <p className="librarian-results__external-text">{t('librarian.usedExternalNote')}</p>
        </div>
      )}

      <ol className="librarian-results__list">
        {recommendations.map((rec, i) => (
          <LibrarianRecommendationCard
            key={`${rec.source}-${rec.slug ?? rec.title}-${i}`}
            index={i}
            rec={rec}
            t={t}
          />
        ))}
      </ol>
    </div>
  )
}
