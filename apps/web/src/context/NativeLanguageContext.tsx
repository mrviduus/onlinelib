import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface NativeLang {
  code: string
  flag: string
  label: string
}

export const NATIVE_LANGUAGES: NativeLang[] = [
  { code: 'en', flag: '\u{1F1EC}\u{1F1E7}', label: 'English' },
  { code: 'uk', flag: '\u{1F1FA}\u{1F1E6}', label: 'Ukrainian' },
  { code: 'ru', flag: '\u{1F1F7}\u{1F1FA}', label: 'Russian' },
  { code: 'de', flag: '\u{1F1E9}\u{1F1EA}', label: 'German' },
  { code: 'fr', flag: '\u{1F1EB}\u{1F1F7}', label: 'French' },
  { code: 'es', flag: '\u{1F1EA}\u{1F1F8}', label: 'Spanish' },
  { code: 'pl', flag: '\u{1F1F5}\u{1F1F1}', label: 'Polish' },
]

const STORAGE_KEY = 'textstack_native_language'

function detectDefault(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && NATIVE_LANGUAGES.some((l) => l.code === stored)) return stored
  } catch {}
  const browser = navigator.language?.split('-')[0]
  if (browser && NATIVE_LANGUAGES.some((l) => l.code === browser)) return browser
  return 'uk'
}

interface NativeLanguageContextValue {
  nativeLanguage: string
  setNativeLanguage: (code: string) => void
}

const NativeLanguageContext = createContext<NativeLanguageContextValue>({
  nativeLanguage: 'uk',
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
