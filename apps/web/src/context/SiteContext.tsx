import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export interface SiteConfig {
  siteId: string
  siteCode: string
  primaryDomain: string
  defaultLanguage: string
  theme: string
  adsEnabled: boolean
  indexingEnabled: boolean
  sitemapEnabled: boolean
  features: Record<string, boolean>
}

interface SiteContextValue {
  site: SiteConfig | null
  loading: boolean
  error: string | null
}

const SiteContext = createContext<SiteContextValue>({
  site: null,
  loading: true,
  error: null,
})

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getSiteFromHost(): string | null {
  const host = window.location.hostname

  // Production domains
  if (host === 'textstack.dev' || host === 'www.textstack.dev') return 'programming'
  if (host === 'textstack.app' || host === 'www.textstack.app') return 'general'

  // Dev subdomains
  const subdomain = host.split('.')[0]
  if (subdomain === 'programming') return 'programming'
  if (subdomain === 'general') return 'general'
  if (subdomain === 'fiction') return 'general' // alias

  return null
}

function getSiteParam(): string | null {
  // Query param takes precedence (dev override)
  const params = new URLSearchParams(window.location.search)
  const queryParam = params.get('site')
  if (queryParam) return queryParam

  // Fall back to hostname-based resolution
  return getSiteFromHost()
}

export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<SiteConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const siteParam = getSiteParam()
    const url = siteParam
      ? `${API_BASE}/api/site/context?site=${siteParam}`
      : `${API_BASE}/api/site/context`

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Site not found')
        return res.json()
      })
      .then(data => {
        setSite(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  return (
    <SiteContext.Provider value={{ site, loading, error }}>
      {children}
    </SiteContext.Provider>
  )
}

export function useSite() {
  return useContext(SiteContext)
}
