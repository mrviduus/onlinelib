import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SeoHead } from '../SeoHead'
import { JsonLd } from '../JsonLd'
import { Footer } from '../Footer'
import { LocalizedLink } from '../LocalizedLink'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { useTranslation } from '../../hooks/useTranslation'
import { uploadUserBook } from '../../api/userBooks'
import { DEMO_BOOK } from '../../config/demoBook'
import { getFlagUrl } from '../../data/languages'
import '../../styles/country-landing.css'

// Minimal gtag typing — script loaded in index.html, available at runtime.
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

export interface CountryLandingPageProps {
  countryCode: 'pt-BR' | 'es'
  countryEnglishName: string
  audienceLabel: string
  seo: {
    title: string
    description: string
  }
  hero: {
    h1: string
    subhead: string
    ctaLabel: string
  }
  painBullets: { title: string; body: string }[]
  solutionSteps: { title: string; body: string }[]
  whyItWorks: {
    title: string
    body: string
  }
  faqs: { q: string; a: string }[]
  otherCountries: { slug: string; label: string }[]
}

// Mirror homepage onboarding: primary CTA → DEMO_BOOK reader (zero-friction),
// secondary CTA → file upload. No redirect to /en homepage — landing page
// visitor is cold traffic, one extra click = drop-off.
const DEMO_PATH = `/books/${DEMO_BOOK.bookSlug}/${DEMO_BOOK.chapterSlug}`

function trackCtaClick(countryCode: string, label: 'hero' | 'final') {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', 'landing_cta_click', { country: countryCode, label })
  }
}

export function CountryLandingPage({
  countryCode,
  countryEnglishName,
  audienceLabel,
  seo,
  hero,
  painBullets,
  solutionSteps,
  whyItWorks,
  faqs,
  otherCountries,
}: CountryLandingPageProps) {
  const flagUrl = getFlagUrl(countryCode)
  const { t } = useTranslation()
  const { language } = useLanguage()
  const { ensureSession } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleUpload = async (file: File) => {
    if (uploading) return
    setUploading(true)
    setUploadError(null)
    try {
      await ensureSession()
      const result = await uploadUserBook(file)
      navigate(`/${language}/library/my/${result.userBookId}`)
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    e.target.value = ''
  }

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  }

  return (
    <>
      <SeoHead title={seo.title} description={seo.description} />
      <JsonLd data={faqSchema} />

      <main className="country-landing">
        {/* Hero */}
        <section className="country-landing__section country-landing__hero">
          <div className="country-landing__container">
            {flagUrl && (
              <img
                src={flagUrl}
                alt={`${countryEnglishName} flag`}
                className="country-landing__flag"
                width={64}
                height={48}
              />
            )}
            <p className="country-landing__audience">For {audienceLabel}</p>
            <h1 className="country-landing__h1">{hero.h1}</h1>
            <p className="country-landing__subhead">{hero.subhead}</p>
            <div className="home-hero__cta-group country-landing__cta-group">
              <LocalizedLink
                to={DEMO_PATH}
                className="home-hero__cta-primary"
                onClick={() => trackCtaClick(countryCode, 'hero')}
              >
                {hero.ctaLabel}
              </LocalizedLink>
              {uploading ? (
                <span className="home-hero__cta-secondary" style={{ opacity: 0.7 }}>
                  <span className="material-icons-outlined" style={{ fontSize: 18, marginRight: 4 }}>hourglass_empty</span>
                  {t('guest.uploading')}
                </span>
              ) : (
                <button
                  type="button"
                  className="home-hero__cta-secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className="material-icons-outlined" style={{ fontSize: 18, marginRight: 4 }}>upload_file</span>
                  {t('guest.uploadBook')}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".epub,.pdf,.fb2"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </div>
            {uploadError && (
              <p style={{ color: '#c62828', fontSize: 13, margin: '8px 0 0' }}>{uploadError}</p>
            )}
          </div>
        </section>

        {/* Pain */}
        <section className="country-landing__section country-landing__section--alt">
          <div className="country-landing__container">
            <h2 className="country-landing__h2">Why English reading feels hard</h2>
            <div className="country-landing__grid country-landing__grid--3">
              {painBullets.map((b, i) => (
                <div key={i} className="country-landing__card">
                  <h3 className="country-landing__card-title">{b.title}</h3>
                  <p className="country-landing__card-body">{b.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Solution */}
        <section className="country-landing__section">
          <div className="country-landing__container">
            <h2 className="country-landing__h2">How TextStack fixes it</h2>
            <div className="country-landing__grid country-landing__grid--3">
              {solutionSteps.map((s, i) => (
                <div key={i} className="country-landing__card">
                  <span className="country-landing__step-num">{i + 1}</span>
                  <h3 className="country-landing__card-title">{s.title}</h3>
                  <p className="country-landing__card-body">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why it works */}
        <section className="country-landing__section country-landing__section--alt">
          <div className="country-landing__container country-landing__container--narrow">
            <h2 className="country-landing__h2">{whyItWorks.title}</h2>
            <p className="country-landing__lead">{whyItWorks.body}</p>
          </div>
        </section>

        {/* FAQ */}
        <section className="country-landing__section">
          <div className="country-landing__container country-landing__container--narrow">
            <h2 className="country-landing__h2">Frequently asked</h2>
            <div className="country-landing__faq">
              {faqs.map((f, i) => (
                <details key={i} className="country-landing__faq-item">
                  <summary className="country-landing__faq-q">{f.q}</summary>
                  <p className="country-landing__faq-a">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="country-landing__section country-landing__section--cta">
          <div className="country-landing__container country-landing__container--narrow">
            <h2 className="country-landing__h2">Start reading today</h2>
            <p className="country-landing__subhead">Free. No credit card. No sign-up to try.</p>
            <LocalizedLink
              to={DEMO_PATH}
              className="home-hero__cta-primary"
              onClick={() => trackCtaClick(countryCode, 'final')}
            >
              {hero.ctaLabel}
            </LocalizedLink>
          </div>
        </section>

        {/* Other countries */}
        {otherCountries.length > 0 && (
          <section className="country-landing__section country-landing__other">
            <div className="country-landing__container country-landing__container--narrow">
              <h2 className="country-landing__h3">Also popular with learners from</h2>
              <ul className="country-landing__other-list">
                {otherCountries.map((c) => (
                  <li key={c.slug}>
                    <LocalizedLink to={c.slug} className="country-landing__other-link">
                      {c.label}
                    </LocalizedLink>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </>
  )
}
