import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { getStorageUrl } from '../api/client'
import { useLanguage, SupportedLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import { useDownload } from '../context/DownloadContext'
import { useLibrary } from '../hooks/useLibrary'
import { useSite } from '../context/SiteContext'
import { LocalizedLink } from '../components/LocalizedLink'
import { SeoHead } from '../components/SeoHead'
import { JsonLd } from '../components/JsonLd'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { Footer } from '../components/Footer'
import { stringToColor } from '../utils/colors'
import { getCachedBookMeta } from '../lib/offlineDb'
import { getCanonicalOrigin, buildCanonicalUrl } from '../lib/canonicalUrl'
import {
  getThemes,
  getFAQs,
  generateRelevanceText,
  generateThemeDescription,
} from '../lib/bookSeo'
import { StarRating } from '../components/StarRating'
import { MoodSelector } from '../components/MoodSelector'
import { ShareButtons } from '../components/ShareButtons'
import { ReviewsList } from '../components/reviews/ReviewsList'
import { isNotFoundError } from '../lib/errorUtils'
import type { BookDetail } from '../types/api'

// Strip HTML tags from description text
function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent || ''
}

/** Build a meaningful meta description fallback when seoDescription is missing or too short */
function buildBookMetaDescription(book: BookDetail): string {
  // Prefer seoDescription, then description
  const raw = book.seoDescription || (book.description ? stripHtml(book.description) : '')
  if (raw.length >= 100) return raw

  // Generate a richer fallback
  const authors = book.authors.map(a => a.name).join(', ')
  const genres = (book.genres ?? []).map(g => g.name).join(', ')
  const chapterCount = book.chapters?.length ?? 0

  const parts = [`Read "${book.title}"`]
  if (authors) parts.push(`by ${authors}`)
  parts.push('online for free with instant translation')
  if (genres) parts.push(`. Genre: ${genres}`)
  if (chapterCount > 0) parts.push(`. ${chapterCount} chapters`)
  if (raw) parts.push(`. ${raw}`)
  return parts.join(' ')
}

// Format chapter number with leading zero
function formatChapterNumber(num: number): string {
  return String(num + 1).padStart(2, '0')
}

export function BookDetailPage() {
  const { bookSlug } = useParams<{ bookSlug: string }>()
  const location = useLocation()
  const api = useApi()
  const { language } = useLanguage()
  const { t } = useTranslation()
  const { isDownloading, getProgress, startDownload } = useDownload()
  const { isInLibrary } = useLibrary()
  const { site } = useSite()
  const canonicalOrigin = getCanonicalOrigin(site?.primaryDomain)
  const [book, setBook] = useState<BookDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [showAllChapters, setShowAllChapters] = useState(false)
  const [activeTab, setActiveTab] = useState<'chapters' | 'reviews'>('chapters')

  useEffect(() => {
    if (!bookSlug) return
    let cancelled = false
    setLoading(true)
    api.getBook(bookSlug)
      .then((data) => { if (!cancelled) setBook(data) })
      .catch((err) => { if (!cancelled) setError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [bookSlug, api])

  // Check offline status when book loads
  useEffect(() => {
    if (!book?.id) return
    getCachedBookMeta(book.id).then((meta) => {
      if (meta && meta.cachedChapters >= meta.totalChapters) {
        setIsOffline(true)
      } else {
        setIsOffline(false)
      }
    })
  }, [book?.id])

  // Check localStorage for saved reading progress → "Continue Reading"
  const continueSlug = useMemo(() => {
    if (!book?.id) return null
    try {
      const stored = localStorage.getItem('reading.progress.' + book.id)
      if (stored) {
        const { chapterSlug } = JSON.parse(stored)
        if (chapterSlug && book.chapters.some((c: { slug: string }) => c.slug === chapterSlug)) return chapterSlug
      }
    } catch {}
    return null
  }, [book?.id, book?.chapters])

  // Compute available languages for hreflang
  const availableLanguages = useMemo<SupportedLanguage[]>(() => {
    if (!book) return []
    const langs = new Set<SupportedLanguage>([language])
    book.otherEditions.forEach((ed) => {
      if (ed.language === 'en') {
        langs.add(ed.language)
      }
    })
    return Array.from(langs)
  }, [book, language])

  if (loading) {
    return (
      <div className="book-detail--stitch">
        <div className="book-detail__skeleton" />
      </div>
    )
  }

  if (isNotFoundError(error) || (!book && !error)) {
    return (
      <div className="book-detail--stitch">
        <SeoHead
          title={t('bookDetail.notFound')}
          description={t('bookDetail.notFoundDesc')}
          noindex
          statusCode={404}
        />
        <h1>{t('bookDetail.notFoundHeading')}</h1>
        <p className="error">{error?.message || t('bookDetail.notFoundError')}</p>
        <LocalizedLink to="/" className="back-home-link">
          {t('bookDetail.backToHome')}
        </LocalizedLink>
      </div>
    )
  }

  if (error) {
    return (
      <div className="book-detail--stitch">
        <SeoHead title="Error" />
        <h1>{t('bookDetail.notFoundHeading')}</h1>
        <p className="error">{error.message}</p>
        <LocalizedLink to="/" className="back-home-link">
          {t('bookDetail.backToHome')}
        </LocalizedLink>
      </div>
    )
  }

  if (!book) return null

  const genres = book.genres ?? []
  const moreByAuthor = book.moreByAuthor ?? []
  const firstChapter = book.chapters[0]
  const visibleChapters = showAllChapters ? book.chapters : book.chapters.slice(0, 5)
  const hasMoreChapters = book.chapters.length > 5

  return (
    <>
    <div className="book-detail--stitch">
      <SeoHead
        title={book.seoTitle || book.title}
        description={buildBookMetaDescription(book)}
        image={book.coverPath ? getStorageUrl(book.coverPath) : undefined}
        type="book"
        availableLanguages={availableLanguages}
      />
      <JsonLd
        data={(() => {
          // Sum chapter word counts to estimate page count (~250 words per page is standard)
          const totalWords = book.chapters.reduce((sum, c) => sum + (c.wordCount ?? 0), 0)
          const numberOfPages = totalWords > 0 ? Math.max(1, Math.round(totalWords / 250)) : undefined

          // Only emit AggregateRating if we have at least 1 rating with a value
          const hasRating = book.ratingCount > 0 && book.avgRating != null
          const aggregateRating = hasRating
            ? {
                '@type': 'AggregateRating',
                ratingValue: Number(book.avgRating!.toFixed(2)),
                ratingCount: book.ratingCount,
                reviewCount: book.reviewCount,
                bestRating: 5,
                worstRating: 1,
              }
            : undefined

          // datePublished must be ISO 8601 (YYYY-MM-DD) for schema.org
          const datePublished = book.publishedAt
            ? new Date(book.publishedAt).toISOString().split('T')[0]
            : undefined

          return {
            '@context': 'https://schema.org',
            '@type': 'Book',
            name: book.title,
            description: book.description || undefined,
            inLanguage: book.language,
            bookFormat: 'https://schema.org/EBook',
            isAccessibleForFree: true,
            datePublished,
            numberOfPages,
            aggregateRating,
            image: book.coverPath ? (() => {
              const url = getStorageUrl(book.coverPath)
              return url?.startsWith('http') ? url : `${canonicalOrigin}${url}`
            })() : undefined,
            author: book.authors.map((a) => ({
              '@type': 'Person',
              name: a.name,
              url: buildCanonicalUrl({ origin: canonicalOrigin, pathname: `/${language}/authors/${a.slug}` }),
            })),
            genre: genres.map((g) => g.name),
            url: buildCanonicalUrl({ origin: canonicalOrigin, pathname: location.pathname }),
          }
        })()}
      />

      {/* Breadcrumbs: Home → Books → [Genre if present] → Book Title */}
      <Breadcrumbs
        items={[
          { label: t('breadcrumbs.books'), to: '/books' },
          ...(genres.length > 0
            ? [{ label: genres[0].name, to: `/genres/${genres[0].slug}` }]
            : []),
          { label: book.title },
        ]}
      />

      {/* Hero Section */}
      <section className="book-hero">
        {/* Cover */}
        <div className="book-hero__cover-wrapper">
          <div
            className="book-hero__cover"
            style={{ backgroundColor: book.coverPath ? undefined : stringToColor(book.title) }}
          >
            {book.coverPath ? (
              <img src={getStorageUrl(book.coverPath)} alt={book.title} title={t('bookDetail.readOnlineFree').replace('{title}', book.title)} />
            ) : (
              <span className="book-hero__cover-text">{book.title?.[0] || '?'}</span>
            )}
          </div>
          <div className="book-hero__cover-border" />
        </div>

        {/* Info */}
        <div className="book-hero__info">
          <h1 className="book-hero__title">{book.title}</h1>

          <p className="book-hero__author">
            {book.authors.length > 0
              ? book.authors.map((a, i) => (
                  <span key={a.id}>
                    {i > 0 && ', '}
                    <LocalizedLink to={`/authors/${a.slug}`} className="book-hero__author-link" title={t('bookDetail.viewBiography').replace('{name}', a.name)}>
                      {a.name}
                    </LocalizedLink>
                  </span>
                ))
              : t('books.unknown')}
          </p>

          {book.description && (
            <div className="book-hero__about">
              <h2 className="book-hero__about-title">
                {t('bookDetail.whatIsAbout').replace('{title}', book.title)}
              </h2>
              <p className="book-hero__about-text">{stripHtml(book.description)}</p>
            </div>
          )}

          <StarRating editionId={book.id} />
          <MoodSelector editionId={book.id} />

          {(book.avgRating || book.ratingCount > 0) && (
            <div className="book-hero__rating-summary">
              {book.avgRating && (
                <>
                  <span className="material-icons-outlined book-hero__rating-star">star</span>
                  <span className="book-hero__rating-value">{book.avgRating}</span>
                </>
              )}
              <span className="book-hero__rating-sep">&middot;</span>
              <span>{book.ratingCount} {t('reviews.ratings')}</span>
              {book.reviewCount > 0 && (
                <>
                  <span className="book-hero__rating-sep">&middot;</span>
                  <span>{book.reviewCount} {t('reviews.reviews')}</span>
                </>
              )}
            </div>
          )}

          <div className="book-hero__meta">
            <span className="book-hero__meta-item">
              <span className="material-icons-outlined">auto_stories</span>
              {book.chapters.length} {t('books.chapters')}
            </span>
            <span className="book-hero__meta-dot" />
            <span className="book-hero__meta-item book-hero__meta-item--lang">
              {book.language.toUpperCase()}
            </span>
            {genres.map((g) => (
              <LocalizedLink key={g.id} to={`/genres/${g.slug}`} className="book-hero__meta-genre" title={g.name}>
                {g.name}
              </LocalizedLink>
            ))}
          </div>

          <div className="book-hero__actions">
            {firstChapter && (
              <LocalizedLink
                to={continueSlug
                  ? `/books/${book.slug}/${continueSlug}`
                  : `/books/${book.slug}/${firstChapter.slug}?direct=1`}
                className="book-hero__read-btn"
                title={t('bookDetail.startReadingTitle').replace('{title}', book.title)}
              >
                {continueSlug ? t('bookDetail.continueReading') : t('bookDetail.startReading')}
              </LocalizedLink>
            )}

            {book.id && isDownloading(book.id) && (
              <span className="book-detail__download-status book-detail__download-status--downloading">
                {t('bookDetail.downloading').replace('{progress}', String(getProgress(book.id)))}
              </span>
            )}
            {book.id && !isDownloading(book.id) && isOffline && (
              <span className="book-detail__download-status book-detail__download-status--offline">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {t('bookDetail.availableOffline')}
              </span>
            )}
            {book.id && !isDownloading(book.id) && !isOffline && isInLibrary(book.id) && (
              <button
                className="book-detail__download-btn"
                onClick={() => startDownload(book.id, book.slug, book.title, language)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {t('bookDetail.downloadForOffline')}
              </button>
            )}

            <ShareButtons
              url={`${canonicalOrigin}/${language}/books/${book.slug}`}
              title={book.title}
              subtitle={book.authors.map(a => a.name).join(', ')}
            />
          </div>
        </div>
      </section>

      {/* Chapters / Reviews Tabs */}
      <section className="book-tabs">
        <div className="book-tabs__nav">
          <button
            className={`book-tabs__tab ${activeTab === 'chapters' ? 'book-tabs__tab--active' : ''}`}
            onClick={() => setActiveTab('chapters')}
          >
            <span className="material-icons-outlined">auto_stories</span>
            {t('bookDetail.chaptersHeading')} ({book.chapters.length})
          </button>
          <button
            className={`book-tabs__tab ${activeTab === 'reviews' ? 'book-tabs__tab--active' : ''}`}
            onClick={() => setActiveTab('reviews')}
          >
            <span className="material-icons-outlined">rate_review</span>
            {t('reviews.title')} {book.reviewCount > 0 ? `(${book.reviewCount})` : ''}
          </button>
        </div>

        {activeTab === 'chapters' && (
          <div className="book-tabs__panel">
            <div className="book-chapters__list">
              {visibleChapters.map((ch) => (
                <LocalizedLink
                  key={ch.id}
                  to={`/books/${book.slug}/${ch.slug}?direct=1`}
                  className="book-chapters__item"
                  title={t('bookDetail.readChapter').replace('{title}', ch.title)}
                >
                  <div className="book-chapters__item-left">
                    <span className="book-chapters__number">{formatChapterNumber(ch.chapterNumber)}.</span>
                    <h3 className="book-chapters__title">{ch.title}</h3>
                  </div>
                  <div className="book-chapters__item-right">
                    {ch.wordCount && (
                      <span className="book-chapters__words">{ch.wordCount} {t('bookDetail.words')}</span>
                    )}
                    <span className="book-chapters__arrow material-icons-outlined">arrow_forward_ios</span>
                  </div>
                </LocalizedLink>
              ))}
            </div>

            {hasMoreChapters && !showAllChapters && (
              <button
                className="book-chapters__view-all"
                onClick={() => setShowAllChapters(true)}
              >
                {t('bookDetail.viewAllChapters').replace('{count}', String(book.chapters.length))}
                <span className="material-icons-outlined">expand_more</span>
              </button>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="book-tabs__panel">
            <ReviewsList editionId={book.id} />
          </div>
        )}
      </section>

      {/* Themes */}
      {getThemes(book).length > 0 && (
        <section className="book-themes">
          <h2>{t('bookDetail.mainThemes').replace('{title}', book.title)}</h2>
          <div className="book-themes__grid">
            {getThemes(book).map((theme) => (
              <div key={theme} className="book-themes__item">
                <h3>{theme}</h3>
                <p>{generateThemeDescription(theme, book.title)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Relevance */}
      <section className="book-relevance">
        <h2>{t('bookDetail.whyRelevant').replace('{title}', book.title)}</h2>
        <p>{generateRelevanceText(book, t)}</p>
      </section>

      {/* Author */}
      {book.authors.length > 0 && (
        <section className="book-author-section">
          <h2>{t('bookDetail.aboutAuthor')}</h2>
          <LocalizedLink to={`/authors/${book.authors[0].slug}`}>
            {book.authors[0].name}
          </LocalizedLink>
        </section>
      )}

      {/* More by this author */}
      {moreByAuthor.length > 0 && (
        <section className="book-more-by-author">
          <h2>{t('bookDetail.moreByAuthor')}</h2>
          <div className="book-more-by-author__grid">
            {moreByAuthor.map((b) => (
              <LocalizedLink key={b.id} to={`/books/${b.slug}`} className="book-more-by-author__card">
                <div
                  className="book-more-by-author__cover"
                  style={{ backgroundColor: b.coverPath ? undefined : stringToColor(b.title) }}
                >
                  {b.coverPath ? (
                    <img src={getStorageUrl(b.coverPath)} alt={b.title} loading="lazy" />
                  ) : (
                    <span className="book-more-by-author__cover-text">{b.title?.[0] || '?'}</span>
                  )}
                </div>
                <span className="book-more-by-author__title">{b.title}</span>
              </LocalizedLink>
            ))}
          </div>
        </section>
      )}

      {/* FAQ */}
      <section className="book-faq">
        <h2>{t('bookDetail.faq')}</h2>
        {getFAQs(book, t).map((faq, i) => (
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
          mainEntity: getFAQs(book, t).map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: faq.answer,
            },
          })),
        }}
      />

      {/* Other Editions */}
      {book.otherEditions.length > 0 && (
        <div className="book-detail__editions">
          <h2>{t('bookDetail.otherEditions')}</h2>
          <ul>
            {book.otherEditions.map((ed) => (
              <li key={ed.slug}>
                <Link to={`/${ed.language}/books/${ed.slug}`} title={t('bookDetail.readInLang').replace('{title}', ed.title).replace('{lang}', ed.language.toUpperCase())}>
                  {ed.title} ({ed.language.toUpperCase()})
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <LocalizedLink to="/books" className="book-detail__back" title={t('bookDetail.browseAll')}>
        {t('bookDetail.backToBooks')}
      </LocalizedLink>
    </div>
    <Footer />
    </>
  )
}
