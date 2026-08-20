import { createContext, useContext, useEffect, useMemo, useCallback, ReactNode } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'

const SUPPORTED_LANGUAGES = ['en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]
const DEFAULT_LANGUAGE: SupportedLanguage = 'en'

interface LanguageContextValue {
  language: SupportedLanguage
  supportedLanguages: readonly string[]
  switchLanguage: (lang: SupportedLanguage) => void
  getLocalizedPath: (path: string) => string
}

/**
 * Builds a language-prefixed path. Shared by the provider and the default context
 * value so a consumer rendered OUTSIDE LanguageProvider still produces a working
 * link instead of a bare, unprefixed one.
 *
 * That mattered: CookieBanner is mounted as a sibling of the routes (it must show on
 * `/` too, and LanguageProvider only exists inside `/:lang/*`), so its "Privacy
 * Policy" link resolved through the old identity fallback and pointed at `/privacy`
 * — a path the router does not serve — while every other link on the page pointed at
 * `/en/privacy/`. A consent banner is exactly where that link has to work.
 */
function buildLocalizedPath(path: string, language: SupportedLanguage): string {
  const [pathname, query] = path.split('?')
  const suffix = query ? `?${query}` : ''

  if (pathname.startsWith(`/${language}`)) {
    const normalized = pathname.endsWith('/') ? pathname : `${pathname}/`
    return `${normalized}${suffix}`
  }
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  const result = `/${language}${cleanPath}`
  const normalized = result.endsWith('/') ? result : `${result}/`
  return `${normalized}${suffix}`
}

const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  supportedLanguages: SUPPORTED_LANGUAGES,
  switchLanguage: () => {},
  // Not the identity function. Outside the provider we still know the default
  // language, and a prefixed path is right far more often than a bare one.
  getLocalizedPath: (path) => buildLocalizedPath(path, DEFAULT_LANGUAGE),
})

export { buildLocalizedPath }

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { lang } = useParams<{ lang: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const language: SupportedLanguage =
    lang && SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)
      ? (lang as SupportedLanguage)
      : DEFAULT_LANGUAGE

  // Set <html lang> attribute
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const switchLanguage = useCallback((newLang: SupportedLanguage) => {
    const pathWithoutLang = location.pathname.replace(/^\/en/, '')
    const newPath = `/${newLang}${pathWithoutLang || '/'}`
    navigate(newPath.endsWith('/') ? newPath : `${newPath}/`)
  }, [location.pathname, navigate])

  const getLocalizedPath = useCallback(
    (path: string) => buildLocalizedPath(path, language),
    [language],
  )

  const value = useMemo(() => ({
    language,
    supportedLanguages: SUPPORTED_LANGUAGES,
    switchLanguage,
    getLocalizedPath,
  }), [language, switchLanguage, getLocalizedPath])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}

export function isValidLanguage(lang: string | undefined): lang is SupportedLanguage {
  return !!lang && SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)
}
