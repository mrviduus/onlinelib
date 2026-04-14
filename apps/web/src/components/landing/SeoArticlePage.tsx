import type { ReactNode } from 'react'
import { SeoHead } from '../SeoHead'
import { Footer } from '../Footer'
import { LocalizedLink } from '../LocalizedLink'
import '../../styles/seo-article.css'

// gtag loaded in index.html
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

export interface SeoArticleSection {
  heading: string
  body: ReactNode
}

export interface SeoArticleRelatedLink {
  href: string
  label: string
}

export interface SeoArticlePageProps {
  pageKey: string
  seo: { title: string; description: string }
  hero: { h1: string; subhead?: string }
  sections: SeoArticleSection[]
  cta: { label: string; href: string }
  relatedLinks: SeoArticleRelatedLink[]
}

function trackCtaClick(pageKey: string, label: 'hero' | 'final') {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', 'landing_cta_click', { page: pageKey, label })
  }
}

export function SeoArticlePage({
  pageKey,
  seo,
  hero,
  sections,
  cta,
  relatedLinks,
}: SeoArticlePageProps) {
  return (
    <>
      <SeoHead title={seo.title} description={seo.description} />

      <main className="seo-article">
        <header className="seo-article__hero">
          <h1>{hero.h1}</h1>
          {hero.subhead && <p className="seo-article__hero-sub">{hero.subhead}</p>}
          <LocalizedLink
            to={cta.href}
            className="seo-article__cta"
            onClick={() => trackCtaClick(pageKey, 'hero')}
          >
            {cta.label}
          </LocalizedLink>
        </header>

        {sections.map((s, i) => (
          <section key={i} className="seo-article__section">
            <h2>{s.heading}</h2>
            {typeof s.body === 'string' ? <p>{s.body}</p> : s.body}
          </section>
        ))}

        <section className="seo-article__section seo-article__section--cta">
          <LocalizedLink
            to={cta.href}
            className="seo-article__cta"
            onClick={() => trackCtaClick(pageKey, 'final')}
          >
            {cta.label}
          </LocalizedLink>
        </section>

        {relatedLinks.length > 0 && (
          <nav className="seo-article__related" aria-label="Related pages">
            {relatedLinks.map((link) => (
              <LocalizedLink key={link.href} to={link.href} className="seo-article__related-link">
                {link.label}
              </LocalizedLink>
            ))}
          </nav>
        )}
      </main>

      <Footer />
    </>
  )
}
