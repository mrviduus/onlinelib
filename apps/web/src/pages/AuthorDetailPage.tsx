import { useMemo, useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { getStorageUrl } from '../api/client'
import { LocalizedLink } from '../components/LocalizedLink'
import { SeoHead } from '../components/SeoHead'
import { JsonLd } from '../components/JsonLd'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { Footer } from '../components/Footer'
import { useLanguage } from '../context/LanguageContext'
import { useSite } from '../context/SiteContext'
import { useTranslation } from '../hooks/useTranslation'
import { getCanonicalOrigin, buildCanonicalUrl } from '../lib/canonicalUrl'
import { ShareButtons } from '../components/ShareButtons'
import {
  generateAboutText,
  generateRelevanceText,
  getThemes,
  getFAQs,
  generateThemeDescription,
} from '../lib/authorSeo'
import { isNotFoundError } from '../lib/errorUtils'
import type { AuthorDetail, Author, Genre } from '../types/api'

const EXPLORE_GENRES_LIMIT = 10
const OTHER_AUTHORS_LIMIT = 12

export function AuthorDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const { language } = useLanguage()
  const { site } = useSite()
  const { t } = useTranslation()
  const canonicalOrigin = getCanonicalOrigin(site?.primaryDomain)
  const api = useApi()
  const [author, setAuthor] = useState<AuthorDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [allGenres, setAllGenres] = useState<Genre[]>([])
  const [otherAuthors, setOtherAuthors] = useState<Author[]>([])

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    api.getAuthor(slug)
      .then((data) => { if (!cancelled) setAuthor(data) })
      .catch((err) => { if (!cancelled) setError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [api, slug])

  // Fetch sibling hubs (genres + authors) once — used for contextual internal linking.
  // These calls are best-effort; silent failure keeps the page usable.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.getGenres({ language }).catch(() => ({ items: [] as Genre[] })),
      api.getAuthors({ sort: 'recent', limit: OTHER_AUTHORS_LIMIT + 4 }).catch(() => ({ items: [] as Author[] })),
    ]).then(([genres, authors]) => {
      if (cancelled) return
      setAllGenres(genres.items)
      setOtherAuthors(authors.items)
    })
    return () => { cancelled = true }
  }, [api, language])

  const exploreGenres = useMemo(() => {
    return allGenres
      .filter((g) => g.bookCount > 0)
      .sort((a, b) => b.bookCount - a.bookCount || a.name.localeCompare(b.name))
      .slice(0, EXPLORE_GENRES_LIMIT)
  }, [allGenres])

  const relatedAuthors = useMemo(() => {
    if (!author || !otherAuthors.length) return []
    return otherAuthors
      .filter((a) => a.slug !== author.slug && a.bookCount > 0)
      .slice(0, OTHER_AUTHORS_LIMIT)
  }, [author, otherAuthors])

  if (loading) {
    return (
      <div className="author-detail">
        <div className="author-detail__header author-detail__header--skeleton">
          <div className="author-detail__photo" />
          <div className="author-detail__info">
            <div className="author-detail__name" />
            <div className="author-detail__bio" />
          </div>
        </div>
      </div>
    )
  }

  if (isNotFoundError(error) || (!author && !error)) {
    return (
      <div className="author-detail">
        <SeoHead
          title="Author Not Found"
          description="This author doesn't exist or has no published books."
          noindex
          statusCode={404}
        />
        <h1>{language === 'uk' ? 'Автор не знайдений' : 'Author not found'}</h1>
        <p className="error">{error?.message || 'Not found'}</p>
        <LocalizedLink to="/" className="back-home-link">
          {language === 'uk' ? 'На головну' : 'Back to Home'}
        </LocalizedLink>
      </div>
    )
  }

  if (error) {
    return (
      <div className="author-detail">
        <SeoHead title="Error" />
        <h1>{language === 'uk' ? 'Помилка завантаження' : 'Loading error'}</h1>
        <p className="error">{error.message}</p>
        <LocalizedLink to="/" className="back-home-link">
          {language === 'uk' ? 'На головну' : 'Back to Home'}
        </LocalizedLink>
      </div>
    )
  }

  if (!author) return null

  // Parse external authority links for schema.org sameAs.
  // Shape stored in DB: { wikipedia?, goodreads?, gutenberg?, website?, twitter? }.
  // Invalid JSON or non-http values are silently dropped so the JSON-LD stays clean.
  const sameAs = (() => {
    if (!author.externalLinksJson) return [] as string[]
    try {
      const parsed = JSON.parse(author.externalLinksJson) as Record<string, unknown>
      return Object.values(parsed)
        .filter((v): v is string => typeof v === 'string' && /^https?:\/\//.test(v))
    } catch {
      return [] as string[]
    }
  })()

  const seoTitle = language === 'uk'
    ? `${author.name} — книги автора`
    : `${author.name} — books by author`
  const seoDescription = (() => {
    if (author.bio && author.bio.length >= 100) return author.bio
    const bookTitles = author.editions?.slice(0, 3).map(e => e.title).join(', ') || ''
    if (language === 'uk') {
      const parts = [`Читайте книги автора ${author.name} онлайн безкоштовно з перекладом.`]
      if (author.bookCount > 0) parts.push(`${author.bookCount} книг доступно.`)
      if (bookTitles) parts.push(`Включає: ${bookTitles}.`)
      if (author.bio) parts.push(author.bio)
      return parts.join(' ')
    }
    const parts = [`Read books by ${author.name} online for free with instant translation.`]
    if (author.bookCount > 0) parts.push(`${author.bookCount} books available.`)
    if (bookTitles) parts.push(`Including: ${bookTitles}.`)
    if (author.bio) parts.push(author.bio)
    return parts.join(' ')
  })()

  return (
    <>
    <div className="author-detail">
      <SeoHead
        title={seoTitle}
        description={seoDescription}
        image={author.photoPath ? getStorageUrl(author.photoPath) : undefined}
        type="profile"
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: author.name,
          description: author.bio || undefined,
          image: author.photoPath ? (() => {
            const url = getStorageUrl(author.photoPath)
            return url?.startsWith('http') ? url : `${canonicalOrigin}${url}`
          })() : undefined,
          url: buildCanonicalUrl({ origin: canonicalOrigin, pathname: `/${language}/authors/${author.slug}` }),
          sameAs: sameAs.length > 0 ? sameAs : undefined,
        }}
      />

      {/* Breadcrumbs: Home → Authors → Author Name */}
      <Breadcrumbs
        items={[
          { label: t('breadcrumbs.authors'), to: '/authors' },
          { label: author.name },
        ]}
      />

      <div className="author-detail__header">
        <div className="author-detail__photo-col">
          <div className="author-detail__photo">
            {author.photoPath ? (
              <img src={getStorageUrl(author.photoPath)} alt={author.name} title={`${author.name} - Biography and books`} />
            ) : (
              <span className="author-detail__initials">{author.name?.[0] || '?'}</span>
            )}
          </div>
          <div className="author-detail__publications">
            <span className="author-detail__publications-label">{language === 'uk' ? 'ПУБЛІКАЦІЇ' : 'PUBLICATIONS'}</span>
            <span className="author-detail__publications-count">{author.editions.length} {language === 'uk' ? 'книг' : 'books'}</span>
          </div>
        </div>
        <div className="author-detail__info">
          <h1 className="author-detail__name">{author.name}</h1>
          <div className="author-detail__about-inline">
            <h2>{language === 'uk' ? 'Біографія' : 'Biography'}</h2>
            <p>{generateAboutText(author)}</p>
          </div>
          <ShareButtons
            url={`${canonicalOrigin}/${language}/authors/${author.slug}`}
            title={author.name}
          />
        </div>
      </div>

      {/* Themes Section */}
      {getThemes(author).length > 0 && (
        <section className="author-themes">
          <h2>{language === 'uk' ? `Основні теми у творах ${author.name}` : `Common themes in ${author.name}'s work`}</h2>
          <div className="author-themes__carousel">
            {getThemes(author).map((theme) => (
              <div key={theme} className="author-themes__item">
                <h3>{theme}</h3>
                <p>{generateThemeDescription(theme, author.name)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <h2>{language === 'uk' ? 'Книги' : 'Books'}</h2>
      {author.editions.length === 0 ? (
        <p>{language === 'uk' ? 'Книг поки немає.' : 'No books available.'}</p>
      ) : (
        <div className="books-grid">
          {author.editions.map((book) => (
            <LocalizedLink key={book.id} to={`/books/${book.slug}`} className="book-card" title={`Read ${book.title} online`}>
              <div className="book-card__cover" style={{ backgroundColor: book.coverPath ? undefined : '#e0e0e0' }}>
                {book.coverPath ? (
                  <img src={getStorageUrl(book.coverPath)} alt={book.title} title={`${book.title} - Read online free`} />
                ) : (
                  <span className="book-card__cover-text">{book.title?.[0] || '?'}</span>
                )}
              </div>
              <h3 className="book-card__title">{book.title}</h3>
            </LocalizedLink>
          ))}
        </div>
      )}

      {exploreGenres.length > 0 && (
        <section className="author-related" aria-labelledby="author-explore-genres">
          <h2 id="author-explore-genres">
            {language === 'uk' ? 'Досліджуйте за жанром' : 'Explore by genre'}
          </h2>
          <ul className="author-related__genres">
            {exploreGenres.map((g) => (
              <li key={g.slug}>
                <LocalizedLink to={`/genres/${g.slug}`} className="author-related__chip">
                  {g.name}
                  <span className="author-related__chip-count"> · {g.bookCount}</span>
                </LocalizedLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      {relatedAuthors.length > 0 && (
        <section className="author-related" aria-labelledby="author-other-authors">
          <h2 id="author-other-authors">
            {language === 'uk' ? 'Інші автори' : 'Other authors you may enjoy'}
          </h2>
          <ul className="author-related__authors">
            {relatedAuthors.map((a) => (
              <li key={a.slug}>
                <LocalizedLink to={`/authors/${a.slug}`} className="author-related__author">
                  <div className="author-related__author-photo">
                    {a.photoPath ? (
                      <img src={getStorageUrl(a.photoPath)} alt={a.name} loading="lazy" />
                    ) : (
                      <span className="author-related__author-initials">{a.name?.[0] || '?'}</span>
                    )}
                  </div>
                  <span className="author-related__author-name">{a.name}</span>
                  <span className="author-related__author-count">
                    {a.bookCount} {language === 'uk' ? (a.bookCount === 1 ? 'книга' : 'книг') : (a.bookCount === 1 ? 'book' : 'books')}
                  </span>
                </LocalizedLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Relevance Section */}
      <section className="author-relevance">
        <h2>{language === 'uk' ? `Чому ${author.name} читають і сьогодні` : `Why ${author.name} is still read today`}</h2>
        <p>{generateRelevanceText(author)}</p>
      </section>

      {/* FAQ Section */}
      <section className="author-faq">
        <h2>{language === 'uk' ? 'Часті запитання' : 'Frequently Asked Questions'}</h2>
        {getFAQs(author).map((faq, i) => (
          <details key={i}>
            <summary>{faq.question}</summary>
            <p>{faq.answer}</p>
          </details>
        ))}
      </section>

      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: getFAQs(author).map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: faq.answer,
            },
          })),
        }}
      />
    </div>
    <Footer />
    </>
  )
}
