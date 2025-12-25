import { createContext, useContext, useEffect, ReactNode } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'

const SUPPORTED_LANGUAGES = ['en', 'uk'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]
const DEFAULT_LANGUAGE: SupportedLanguage = 'en'

interface LanguageContextValue {
  language: SupportedLanguage
  supportedLanguages: readonly string[]
  switchLanguage: (lang: SupportedLanguage) => void
  getLocalizedPath: (path: string) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  supportedLanguages: SUPPORTED_LANGUAGES,
  switchLanguage: () => {},
  getLocalizedPath: (path) => path,
})

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

  const switchLanguage = (newLang: SupportedLanguage) => {
    const pathWithoutLang = location.pathname.replace(/^\/(uk|en)/, '')
    navigate(`/${newLang}${pathWithoutLang || '/'}`)
  }

  const getLocalizedPath = (path: string) => {
    if (path.startsWith(`/${language}`)) return path
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    return `/${language}${cleanPath}`
  }

  return (
    <LanguageContext.Provider
      value={{
        language,
        supportedLanguages: SUPPORTED_LANGUAGES,
        switchLanguage,
        getLocalizedPath,
      }}
    >
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
