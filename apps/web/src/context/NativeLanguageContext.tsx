import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { LANGUAGES, POPULAR_LANGUAGES, getFlagUrl as dataGetFlagUrl } from '../data/languages'

export interface NativeLang {
  code: string
  label: string
}

// Backwards-compat: old consumers expect NATIVE_LANGUAGES = popular list with { code, label }
export const NATIVE_LANGUAGES: NativeLang[] = POPULAR_LANGUAGES.map((l) => ({
  code: l.code,
  label: l.englishName,
}))

export function getFlagUrl(code: string): string {
  return dataGetFlagUrl(code)
}

const STORAGE_KEY = 'textstack_native_language'

function isSupported(code: string): boolean {
  return LANGUAGES.some((l) => l.code === code)
}

// Country-targeted SEO landing pages → HARD-bind native language to URL.
// Brazil landing → pt-BR, Spain → es. Always wins over stored preference:
// visiting a country landing is a strong intent signal.
const COUNTRY_LANDING_LANG: Record<string, string> = {
  brazil: 'pt-BR',
  spain: 'es',
}

function getLandingLang(pathname: string): string | null {
  const match = pathname.match(/\/learn-english-(brazil|spain)/)
  if (!match) return null
  const lang = COUNTRY_LANDING_LANG[match[1]]
  return lang && isSupported(lang) ? lang : null
}

function detectDefault(): string {
  // Landing page URL is the strongest signal — overrides stored preference.
  try {
    const landing = getLandingLang(window.location.pathname)
    if (landing) return landing
  } catch {}
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && isSupported(stored)) return stored
  } catch {}
  const browser = navigator.language?.split('-')[0]
  if (browser && isSupported(browser)) return browser
  try {
    for (const lang of navigator.languages || []) {
      const code = lang.split('-')[0]
      if (isSupported(code)) return code
    }
  } catch {}
  return 'en'
}

interface NativeLanguageContextValue {
  nativeLanguage: string
  setNativeLanguage: (code: string) => void
}

const NativeLanguageContext = createContext<NativeLanguageContextValue>({
  nativeLanguage: 'en',
  setNativeLanguage: () => {},
})

export function NativeLanguageProvider({ children }: { children: ReactNode }) {
  const [nativeLanguage, setNativeLanguageState] = useState(detectDefault)
  const location = useLocation()

  const setNativeLanguage = useCallback((code: string) => {
    if (!isSupported(code)) return
    setNativeLanguageState(code)
    try { localStorage.setItem(STORAGE_KEY, code) } catch {}
  }, [])

  // Hard-bind native language to country landing URL. SPA navigation between
  // landings (or first SPA mount on a landing) must always force the matching
  // native language — overrides any stored preference.
  useEffect(() => {
    const landing = getLandingLang(location.pathname)
    if (landing && landing !== nativeLanguage) {
      setNativeLanguageState(landing)
      try { localStorage.setItem(STORAGE_KEY, landing) } catch {}
    }
  }, [location.pathname, nativeLanguage])

  return (
    <NativeLanguageContext.Provider value={{ nativeLanguage, setNativeLanguage }}>
      {children}
    </NativeLanguageContext.Provider>
  )
}

export function useNativeLanguage() {
  return useContext(NativeLanguageContext)
}
