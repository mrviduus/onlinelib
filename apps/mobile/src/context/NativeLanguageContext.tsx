import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { NativeModules, Platform } from 'react-native'
import { LANGUAGES, POPULAR_LANGUAGES, getFlagEmoji } from '../data/languages'

export interface NativeLang {
  code: string
  flag: string
  label: string
}

// Backwards-compat: old consumers expect NATIVE_LANGUAGES = popular list with { code, flag, label }
export const NATIVE_LANGUAGES: NativeLang[] = POPULAR_LANGUAGES.map((l) => ({
  code: l.code,
  flag: getFlagEmoji(l.code),
  label: l.englishName,
}))

// Target languages = languages with book content
export const TARGET_LANGUAGES = NATIVE_LANGUAGES.filter((l) => l.code === 'en' || l.code === 'uk')

const NATIVE_KEY = 'textstack_native_language'
const TARGET_KEY = 'textstack_target_language'

function isSupported(code: string): boolean {
  return LANGUAGES.some((l) => l.code === code)
}

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
      if (native && isSupported(native)) {
        setNativeState(native)
      } else {
        const device = getDeviceLanguage()
        if (isSupported(device)) setNativeState(device)
      }
      if (target && TARGET_LANGUAGES.some((l) => l.code === target)) {
        setTargetState(target)
      }
    }).catch(() => {})
  }, [])

  const setNativeLanguage = useCallback((code: string) => {
    if (!isSupported(code)) return
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
