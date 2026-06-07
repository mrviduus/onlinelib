import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { NativeModules, Platform } from 'react-native'
import { authApi } from '@textstack/shared'
import { LANGUAGES, POPULAR_LANGUAGES, getFlagEmoji } from '../data/languages'
import { useAuth } from './AuthContext'

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
export const TARGET_LANGUAGES = NATIVE_LANGUAGES.filter((l) => l.code === 'en')

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
    return locale?.split(/[-_]/)[0] || 'en'
  } catch {
    return 'en'
  }
}

interface NativeLanguageContextValue {
  nativeLanguage: string
  targetLanguage: string
  setNativeLanguage: (code: string) => void
  setTargetLanguage: (code: string) => void
}

const NativeLanguageContext = createContext<NativeLanguageContextValue>({
  nativeLanguage: 'en',
  targetLanguage: 'en',
  setNativeLanguage: () => {},
  setTargetLanguage: () => {},
})

export function NativeLanguageProvider({ children }: { children: ReactNode }) {
  const [nativeLanguage, setNativeState] = useState('en')
  const [targetLanguage, setTargetState] = useState('en')
  const { user, getAccessToken, updateUser } = useAuth()
  const prevUserIdRef = useRef<string | undefined>(user?.id)
  // Set once the server→local mirror has applied an authoritative value, so the
  // (async) AsyncStorage load below can't clobber it back on a cold launch where
  // the two resolve in an arbitrary order.
  const serverLangAppliedRef = useRef(false)

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(NATIVE_KEY),
      AsyncStorage.getItem(TARGET_KEY),
    ]).then(([native, target]) => {
      // The signed-in user's server language wins — don't overwrite it with the
      // stale local value just because this async read happened to resolve last.
      if (!serverLangAppliedRef.current) {
        if (native && isSupported(native)) {
          setNativeState(native)
        } else {
          const device = getDeviceLanguage()
          if (isSupported(device)) setNativeState(device)
        }
      }
      if (target && TARGET_LANGUAGES.some((l) => l.code === target)) {
        setTargetState(target)
      }
    }).catch(() => {})
  }, [])

  // Server → local: mirror the signed-in user's nativeLanguage into state +
  // AsyncStorage. THIS is what was missing — without it mobile stayed on the
  // local default ('en') even when the user had set Russian on the web/DB, so
  // the reader's translation gloss (book lang → native lang) had no valid target
  // and never appeared. Mirrors apps/web NativeLanguageContext.
  //
  // Keyed on user id + the server lang (primitives), NOT on local nativeLanguage,
  // so a local change pushed to the server (which round-trips via updateUser)
  // doesn't race the mirror back to the old value.
  useEffect(() => {
    const switched = prevUserIdRef.current !== user?.id
    prevUserIdRef.current = user?.id
    // On sign-out, fall back to the device default so a stale value from the
    // previous account doesn't leak into the next session.
    if (!user) {
      if (switched) {
        const device = getDeviceLanguage()
        setNativeState(isSupported(device) ? device : 'en')
      }
      return
    }
    if (user.isGuest) return
    const serverLang = user.nativeLanguage
    if (!serverLang || !isSupported(serverLang)) return
    serverLangAppliedRef.current = true
    setNativeState(serverLang)   // idempotent — React skips if unchanged
    AsyncStorage.setItem(NATIVE_KEY, serverLang).catch(() => {})
  }, [user?.id, user?.nativeLanguage, user?.isGuest])

  const setNativeLanguage = useCallback((code: string) => {
    if (!isSupported(code)) return
    setNativeState(code)
    AsyncStorage.setItem(NATIVE_KEY, code).catch(() => {})
    // Local → server: persist for signed-in (non-guest) users so the pref
    // follows them across devices and matches the web.
    if (user && !user.isGuest) {
      ;(async () => {
        try {
          const token = await getAccessToken()
          if (!token) return
          const res = await authApi.updateProfile(user.name ?? null, token, code)
          if (res?.user) await updateUser(res.user)
        } catch {
          // Keep the local value; the next login's server→local mirror reconciles.
        }
      })()
    }
  }, [user, getAccessToken, updateUser])

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
