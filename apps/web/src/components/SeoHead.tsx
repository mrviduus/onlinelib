import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useLanguage, SupportedLanguage } from '../context/LanguageContext'

interface SeoHeadProps {
  title?: string
  description?: string
  availableLanguages?: SupportedLanguage[]
}

const HREFLANG_DATA_ATTR = 'data-hreflang-managed'

export function SeoHead({ title, description, availableLanguages }: SeoHeadProps) {
  const location = useLocation()
  const { language } = useLanguage()

  useEffect(() => {
    const origin = window.location.origin

    // Set canonical URL
    const canonicalUrl = `${origin}${location.pathname}`
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.rel = 'canonical'
      document.head.appendChild(link)
    }
    link.href = canonicalUrl

    // Set title
    if (title) {
      document.title = `${title} | OnlineLib`
    }

    // Set description
    if (description) {
      let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
      if (!meta) {
        meta = document.createElement('meta')
        meta.name = 'description'
        document.head.appendChild(meta)
      }
      meta.content = description
    }

    // Set hreflang tags
    // Remove existing managed hreflang links
    document.querySelectorAll(`link[${HREFLANG_DATA_ATTR}]`).forEach((el) => el.remove())

    if (availableLanguages && availableLanguages.length > 0) {
      const pathWithoutLang = location.pathname.replace(/^\/(uk|en)/, '')

      availableLanguages.forEach((lang) => {
        const hreflangLink = document.createElement('link')
        hreflangLink.rel = 'alternate'
        hreflangLink.hreflang = lang
        hreflangLink.href = `${origin}/${lang}${pathWithoutLang}`
        hreflangLink.setAttribute(HREFLANG_DATA_ATTR, 'true')
        document.head.appendChild(hreflangLink)
      })

      // Add x-default pointing to current language
      const xDefaultLink = document.createElement('link')
      xDefaultLink.rel = 'alternate'
      xDefaultLink.hreflang = 'x-default'
      xDefaultLink.href = `${origin}/${language}${pathWithoutLang}`
      xDefaultLink.setAttribute(HREFLANG_DATA_ATTR, 'true')
      document.head.appendChild(xDefaultLink)
    }

    return () => {
      // Cleanup hreflang on unmount
      document.querySelectorAll(`link[${HREFLANG_DATA_ATTR}]`).forEach((el) => el.remove())
    }
  }, [location.pathname, title, description, availableLanguages, language])

  return null
}
