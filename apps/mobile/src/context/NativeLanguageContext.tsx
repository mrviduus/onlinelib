import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { NativeModules, Platform } from 'react-native'

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

// Target languages = languages with book content
export const TARGET_LANGUAGES = NATIVE_LANGUAGES.filter(l => l.code === 'en' || l.code === 'uk')

const NATIVE_KEY = 'textstack_native_language'
const TARGET_KEY = 'textstack_target_language'

function getDeviceLanguage(): string {
  try {
    const locale =
      Platform.OS === 'ios'
        ? NativeModules.SettingsManager?.settings?.AppleLocale ||
          NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
        : NativeModules.I18nManager?.localeIdentifier
    return locale?.split(/[-_]/)[0] || 'uk'
  } catch {
    return 'uk'
  }
}

interface NativeLanguageContextValue {
  nativeLanguage: string
  targetLanguage: string
  setNativeLanguage: (code: string) => void
  setTargetLanguage: (code: string) => void
}

const NativeLanguageContext = createContext<NativeLanguageContextValue>({
  nativeLanguage: 'uk',
  targetLanguage: 'en',
  setNativeLanguage: () => {},
  setTargetLanguage: () => {},
})

export function NativeLanguageProvider({ children }: { children: ReactNode }) {
  const [nativeLanguage, setNativeState] = useState('uk')
  const [targetLanguage, setTargetState] = useState('en')

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(NATIVE_KEY),
      AsyncStorage.getItem(TARGET_KEY),
    ]).then(([native, target]) => {
      if (native && NATIVE_LANGUAGES.some(l => l.code === native)) {
        setNativeState(native)
      } else {
        const device = getDeviceLanguage()
        if (NATIVE_LANGUAGES.some(l => l.code === device)) setNativeState(device)
      }
      if (target && TARGET_LANGUAGES.some(l => l.code === target)) {
        setTargetState(target)
      }
    }).catch(() => {})
  }, [])

  const setNativeLanguage = useCallback((code: string) => {
    setNativeState(code)
    AsyncStorage.setItem(NATIVE_KEY, code).catch(() => {})
  }, [])

  const setTargetLanguage = useCallback((code: string) => {
    setTargetState(code)
    AsyncStorage.setItem(TARGET_KEY, code).catch(() => {})
  }, [])

  return (
    <NativeLanguageContext.Provider value={{ nativeLanguage, targetLanguage, setNativeLanguage, setTargetLanguage }}>
      {children}
    </NativeLanguageContext.Provider>
  )
}

export function useNativeLanguage() {
  return useContext(NativeLanguageContext)
}
