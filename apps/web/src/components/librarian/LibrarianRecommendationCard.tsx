import { LocalizedLink } from '../LocalizedLink'
import type { LibrarianRecommendation } from '../../api/librarian'

interface Props {
  index: number
  rec: LibrarianRecommendation
  t: (key: string, vars?: Record<string, string | number>) => string
}

// A single ranked recommendation. Two visually-distinct treatments:
//  - `library` (has a slug) → a clickable card linking into the catalog book page.
//  - `open_library`         → a clearly-marked "suggestion, not in your library yet" card with NO in-app link.
// `title`/`why` come straight from the model — React escapes them and `.tutor-clamp` bounds their height so an
// over-long string can't blow up the layout.
export function LibrarianRecommendationCard({ index, rec, t }: Props) {
  const isLibrary = rec.source === 'library' && !!rec.slug
  const authors = rec.authors.length > 0 ? rec.authors.join(', ') : t('librarian.unknownAuthor')

  const meta: string[] = []
  if (rec.year != null) meta.push(String(rec.year))
  if (rec.pages != null) meta.push(t('librarian.pagesCount', { count: rec.pages }))

  const body = (
    <>
      <span className="librarian-rec__index" aria-hidden>{index + 1}</span>
      <div className="librarian-rec__body">
        <div className="librarian-rec__head">
          <h3 className="librarian-rec__title tutor-clamp tutor-clamp--1">{rec.title}</h3>
          {!isLibrary && (
            <span className="librarian-rec__badge">{t('librarian.suggestionBadge')}</span>
          )}
        </div>
        <p className="librarian-rec__authors tutor-clamp tutor-clamp--1">{authors}</p>
        {meta.length > 0 && <p className="librarian-rec__meta">{meta.join(' · ')}</p>}
        <p className="librarian-rec__why tutor-clamp tutor-clamp--3">{rec.why}</p>
        {!isLibrary && (
          <p className="librarian-rec__suggestion-note">{t('librarian.suggestionNote')}</p>
        )}
      </div>
    </>
  )

  if (isLibrary) {
    return (
      <li className="librarian-rec librarian-rec--library">
        <LocalizedLink
          to={`/books/${rec.slug}`}
          className="librarian-rec__link"
          title={t('librarian.openBook', { title: rec.title })}
        >
          {body}
        </LocalizedLink>
      </li>
    )
  }

  // External suggestion: NOT a link into the app — it doesn't exist in the catalog.
  return (
    <li className="librarian-rec librarian-rec--external">
      <div className="librarian-rec__static">{body}</div>
    </li>
  )
}
