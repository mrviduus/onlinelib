import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { t, supportedLanguages, type Language } from '@textstack/shared'

interface LanguageContextValue {
  language: Language
  switchLanguage: (lang: Language) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  switchLanguage: () => {},
  t: (key: string) => key,
})

const STORAGE_KEY = 'textstack_language'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('en')

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val && supportedLanguages.includes(val as Language)) {
        setLanguage(val as Language)
      }
    }).catch(() => {})
  }, [])

  const switchLanguage = useCallback((lang: Language) => {
    setLanguage(lang)
    AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {})
  }, [])

  const translate = useCallback((key: string) => t(language, key), [language])

  return (
    <LanguageContext.Provider value={{ language, switchLanguage, t: translate }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
