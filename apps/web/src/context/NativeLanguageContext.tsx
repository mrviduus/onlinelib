import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface NativeLang {
  code: string
  label: string
}

// Twemoji CDN flag URLs — works on all platforms including Windows
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg'
const FLAG_SVG: Record<string, string> = {
  en: `${TWEMOJI_BASE}/1f1ec-1f1e7.svg`,
  uk: `${TWEMOJI_BASE}/1f1fa-1f1e6.svg`,
  ru: `${TWEMOJI_BASE}/1f1f7-1f1fa.svg`,
  de: `${TWEMOJI_BASE}/1f1e9-1f1ea.svg`,
  fr: `${TWEMOJI_BASE}/1f1eb-1f1f7.svg`,
  es: `${TWEMOJI_BASE}/1f1ea-1f1f8.svg`,
  pl: `${TWEMOJI_BASE}/1f1f5-1f1f1.svg`,
  fa: `${TWEMOJI_BASE}/1f1ee-1f1f7.svg`,
}

export function getFlagUrl(code: string): string {
  return FLAG_SVG[code] || ''
}

export const NATIVE_LANGUAGES: NativeLang[] = [
  { code: 'en', label: 'English' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'ru', label: 'Russian' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'pl', label: 'Polish' },
  { code: 'fa', label: 'Farsi' },
]

const STORAGE_KEY = 'textstack_native_language'

function detectDefault(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && NATIVE_LANGUAGES.some((l) => l.code === stored)) return stored
  } catch {}
  const browser = navigator.language?.split('-')[0]
  if (browser && NATIVE_LANGUAGES.some((l) => l.code === browser)) return browser
  try {
    for (const lang of navigator.languages || []) {
      const code = lang.split('-')[0]
      if (NATIVE_LANGUAGES.some((l) => l.code === code)) return code
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

  const setNativeLanguage = useCallback((code: string) => {
    setNativeLanguageState(code)
    try { localStorage.setItem(STORAGE_KEY, code) } catch {}
  }, [])

  return (
    <NativeLanguageContext.Provider value={{ nativeLanguage, setNativeLanguage }}>
      {children}
    </NativeLanguageContext.Provider>
  )
}

export function useNativeLanguage() {
  return useContext(NativeLanguageContext)
}
