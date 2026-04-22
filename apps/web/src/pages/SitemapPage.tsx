import { useEffect, useMemo, useState } from 'react'
import { useApi } from '../hooks/useApi'
import { LocalizedLink } from '../components/LocalizedLink'
import { SeoHead } from '../components/SeoHead'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { Footer } from '../components/Footer'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import type { Edition, Author, Genre } from '../types/api'

// Batch size when walking paginated endpoints. Large enough to finish in 1-2
// round trips for most sites, small enough to keep the response payload
// reasonable for slower connections.
const PAGE_SIZE = 500

type BookLite = Pick<Edition, 'slug' | 'title'>
type AuthorLite = Pick<Author, 'slug' | 'name'>
type GenreLite = Pick<Genre, 'slug' | 'name'>

/**
 * Walks a paginated endpoint (total + items) and returns every item.
 * Sequential to respect rate limits and keep ordering stable.
 */
async function collectAll<T>(
  fetcher: (offset: number, limit: number) => Promise<{ total: number; items: T[] }>,
): Promise<T[]> {
  const first = await fetcher(0, PAGE_SIZE)
  const results = [...first.items]
  const total = first.total
  for (let offset = results.length; offset < total; offset += PAGE_SIZE) {
    const next = await fetcher(offset, PAGE_SIZE)
    if (next.items.length === 0) break
    results.push(...next.items)
  }
  return results
}

function alphaSort<T>(arr: T[], key: (item: T) => string): T[] {
  return [...arr].sort((a, b) => key(a).localeCompare(key(b)))
}

/**
 * HTML sitemap — browsable index of every indexable page.
 *
 * Why this page exists (SEO):
 * - Ahrefs and Google reward deep internal link equity; one flat page that
 *   links to every book / author / genre pushes link juice to
 *   long-tail pages that would otherwise be 3+ clicks deep.
 * - Supplements the XML sitemap: search engines crawl the XML for discovery,
 *   users crawl this HTML sitemap when the on-site search / nav falls short.
 * - Indexable itself (no noindex) — becomes a legitimate landing page for
 *   "all books by X" type queries.
 */
export function SitemapPage() {
  const api = useApi()
  const { language } = useLanguage()
  const { t } = useTranslation()

  const [books, setBooks] = useState<BookLite[] | null>(null)
  const [authors, setAuthors] = useState<AuthorLite[] | null>(null)
  const [genres, setGenres] = useState<GenreLite[] | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadBooks = collectAll<Edition>((offset, limit) =>
      api.getBooks({ offset, limit }),
    ).then((items) => {
      if (!cancelled) {
        setBooks(alphaSort(items.map((e) => ({ slug: e.slug, title: e.title })), (b) => b.title))
      }
    }).catch(() => { if (!cancelled) setBooks([]) })

    const loadAuthors = collectAll<Author>((offset, limit) =>
      api.getAuthors({ offset, limit, sort: 'name' }),
    ).then((items) => {
      if (!cancelled) {
        setAuthors(alphaSort(items.map((a) => ({ slug: a.slug, name: a.name })), (a) => a.name))
      }
    }).catch(() => { if (!cancelled) setAuthors([]) })

    const loadGenres = api.getGenres({ language }).then((res) => {
      if (!cancelled) {
        setGenres(alphaSort(res.items.map((g) => ({ slug: g.slug, name: g.name })), (g) => g.name))
      }
    }).catch(() => { if (!cancelled) setGenres([]) })

    Promise.all([loadBooks, loadAuthors, loadGenres]).catch(() => {})

    return () => { cancelled = true }
  }, [api, language])

  const isLoading = books === null || authors === null || genres === null

  // Memoise render output so re-renders triggered by unrelated context changes
  // don't re-sort thousands of entries.
  const bookList = useMemo(() => books ?? [], [books])
  const authorList = useMemo(() => authors ?? [], [authors])
  const genreList = useMemo(() => genres ?? [], [genres])

  return (
    <>
      <div className="sitemap-page">
        <SeoHead title={t('sitemap.seoTitle')} description={t('sitemap.seoDesc')} />

        <Breadcrumbs items={[{ label: t('sitemap.title') }]} />

        <h1>{t('sitemap.title')}</h1>

        {/* Top-level navigation */}
        <section className="sitemap-section">
          <h2>{t('sitemap.navigation')}</h2>
          <ul className="sitemap-list">
            <li><LocalizedLink to="/">Home</LocalizedLink></li>
            <li><LocalizedLink to="/books">{t('sitemap.books')}</LocalizedLink></li>
            <li><LocalizedLink to="/authors">{t('sitemap.authors')}</LocalizedLink></li>
            <li><LocalizedLink to="/genres">{t('sitemap.genres')}</LocalizedLink></li>
          </ul>
        </section>

        {isLoading && <p className="sitemap-loading">{t('sitemap.loading')}</p>}

        {/* Books */}
        {bookList.length > 0 && (
          <section className="sitemap-section">
            <h2>
              {t('sitemap.books')}{' '}
              <span className="sitemap-count">
                {t('sitemap.totalBooks').replace('{count}', String(bookList.length))}
              </span>
            </h2>
            <ul className="sitemap-list sitemap-list--columns">
              {bookList.map((b) => (
                <li key={b.slug}>
                  <LocalizedLink to={`/books/${b.slug}`}>{b.title}</LocalizedLink>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Authors */}
        {authorList.length > 0 && (
          <section className="sitemap-section">
            <h2>
              {t('sitemap.authors')}{' '}
              <span className="sitemap-count">
                {t('sitemap.totalAuthors').replace('{count}', String(authorList.length))}
              </span>
            </h2>
            <ul className="sitemap-list sitemap-list--columns">
              {authorList.map((a) => (
                <li key={a.slug}>
                  <LocalizedLink to={`/authors/${a.slug}`}>{a.name}</LocalizedLink>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Genres */}
        {genreList.length > 0 && (
          <section className="sitemap-section">
            <h2>
              {t('sitemap.genres')}{' '}
              <span className="sitemap-count">
                {t('sitemap.totalGenres').replace('{count}', String(genreList.length))}
              </span>
            </h2>
            <ul className="sitemap-list sitemap-list--columns">
              {genreList.map((g) => (
                <li key={g.slug}>
                  <LocalizedLink to={`/genres/${g.slug}`}>{g.name}</LocalizedLink>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Help & static pages */}
        <section className="sitemap-section">
          <h2>{t('sitemap.help')}</h2>
          <ul className="sitemap-list">
            <li><LocalizedLink to="/about">About</LocalizedLink></li>
            <li><LocalizedLink to="/contact">{t('footer.contact')}</LocalizedLink></li>
            <li><LocalizedLink to="/privacy">{t('footer.privacy')}</LocalizedLink></li>
            <li><LocalizedLink to="/terms">{t('footer.terms')}</LocalizedLink></li>
          </ul>
        </section>
      </div>
      <Footer />
    </>
  )
}
