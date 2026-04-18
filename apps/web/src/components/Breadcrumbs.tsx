import { LocalizedLink } from './LocalizedLink'
import { JsonLd } from './JsonLd'
import { useLanguage } from '../context/LanguageContext'
import { useSite } from '../context/SiteContext'
import { useTranslation } from '../hooks/useTranslation'
import { getCanonicalOrigin, buildCanonicalUrl } from '../lib/canonicalUrl'

export interface BreadcrumbItem {
  /** Display label */
  label: string
  /**
   * Path WITHOUT language prefix (e.g. "/books", "/authors/tolstoy").
   * Omit for the current-page item (always the last one) — it will render
   * as plain text with aria-current="page".
   */
  to?: string
}

interface BreadcrumbsProps {
  /** Items between Home and the current page. Order: parent → child. */
  items: BreadcrumbItem[]
  /** Auto-prepend a Home root item. Default: true. */
  includeHome?: boolean
}

/**
 * Renders visual breadcrumb nav AND emits BreadcrumbList JSON-LD for SEO.
 *
 * - Visual uses the existing `.breadcrumbs` styles (apps/web/src/styles/books.css).
 * - JSON-LD omits `item` on the last entry per schema.org BreadcrumbList spec
 *   (last item is the current page and doesn't need a URL).
 * - URLs in JSON-LD are absolute (origin + lang prefix + path) so Google can
 *   resolve them regardless of where the page is crawled from.
 *
 * Usage:
 *   <Breadcrumbs items={[
 *     { label: t('breadcrumbs.books'), to: '/books' },
 *     { label: 'Horror', to: '/genres/horror' },
 *     { label: book.title }, // no `to` → current page
 *   ]} />
 */
export function Breadcrumbs({ items, includeHome = true }: BreadcrumbsProps) {
  const { language } = useLanguage()
  const { site } = useSite()
  const { t } = useTranslation()
  const canonicalOrigin = getCanonicalOrigin(site?.primaryDomain)

  const allItems: BreadcrumbItem[] = includeHome
    ? [{ label: t('breadcrumbs.home'), to: '/' }, ...items]
    : items

  const buildItemUrl = (to: string): string => {
    // Home: "/" → "/{lang}"; other paths: "/{lang}{to}"
    const pathname = to === '/' ? `/${language}` : `/${language}${to}`
    return buildCanonicalUrl({ origin: canonicalOrigin, pathname })
  }

  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <ol>
          {allItems.map((item, idx) => {
            const isLast = idx === allItems.length - 1
            if (isLast) {
              return (
                <li key={idx} aria-current="page">
                  {item.label}
                </li>
              )
            }
            return (
              <li key={idx}>
                {item.to ? (
                  <LocalizedLink to={item.to}>{item.label}</LocalizedLink>
                ) : (
                  <span>{item.label}</span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: allItems.map((item, idx) => {
            const isLast = idx === allItems.length - 1
            const entry: Record<string, unknown> = {
              '@type': 'ListItem',
              position: idx + 1,
              name: item.label,
            }
            // Per schema.org spec, the last item (current page) may omit `item`.
            // For others, include the absolute URL so Google can follow.
            if (!isLast && item.to) {
              entry.item = buildItemUrl(item.to)
            }
            return entry
          }),
        }}
      />
    </>
  )
}
