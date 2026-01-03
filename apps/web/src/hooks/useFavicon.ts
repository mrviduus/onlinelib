import { useEffect } from 'react'
import { useSite } from '../context/SiteContext'

const FAVICON_PATHS: Record<string, string> = {
  general: '/favicon/general/favicon.svg',
  programming: '/favicon/programming/favicon.svg',
}

export function useFavicon() {
  const { site } = useSite()

  useEffect(() => {
    if (!site) return

    const faviconPath = FAVICON_PATHS[site.siteCode] || FAVICON_PATHS.general

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      link.type = 'image/svg+xml'
      document.head.appendChild(link)
    }

    link.href = faviconPath
  }, [site])
}
