import { useEffect } from 'react'
import { useSite } from '../context/SiteContext'

interface SiteFaviconConfig {
  path: string
  themeColor: string
  manifest: string
}

const FAVICON_CONFIG: Record<string, SiteFaviconConfig> = {
  general: {
    path: '/favicon/general/favicon.svg',
    themeColor: '#F97316',
    manifest: '/favicon/general/site.webmanifest',
  },
  programming: {
    path: '/favicon/programming/favicon.svg',
    themeColor: '#2563EB',
    manifest: '/favicon/programming/site.webmanifest',
  },
}

function getOrCreateLink(rel: string, type?: string): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!link) {
    link = document.createElement('link')
    link.rel = rel
    if (type) link.type = type
    document.head.appendChild(link)
  }
  return link
}

function getOrCreateMeta(name: string): HTMLMetaElement {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = name
    document.head.appendChild(meta)
  }
  return meta
}

export function useFavicon() {
  const { site } = useSite()

  useEffect(() => {
    if (!site) return

    const config = FAVICON_CONFIG[site.siteCode] || FAVICON_CONFIG.general

    // Standard favicon
    const iconLink = getOrCreateLink('icon', 'image/svg+xml')
    iconLink.href = config.path

    // Apple touch icon
    const appleLink = getOrCreateLink('apple-touch-icon')
    appleLink.href = config.path

    // Web manifest
    const manifestLink = getOrCreateLink('manifest')
    manifestLink.href = config.manifest

    // Theme color
    const themeMeta = getOrCreateMeta('theme-color')
    themeMeta.content = config.themeColor
  }, [site])
}
