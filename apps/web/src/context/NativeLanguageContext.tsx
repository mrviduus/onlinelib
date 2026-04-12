import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
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

function detectDefault(): string {
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

  const setNativeLanguage = useCallback((code: string) => {
    if (!isSupported(code)) return
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
