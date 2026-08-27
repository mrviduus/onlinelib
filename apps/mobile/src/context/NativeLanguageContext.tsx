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

// There is no TARGET_LANGUAGES any more. It was NATIVE_LANGUAGES.filter(code ===
// 'en') — one entry — and it backed a Profile row of chips with a single,
// permanently-selected option. QA read that row as a real setting and concluded
// the app thought they were learning English. The concept returns when the
// catalogue has a second language; until then it was state nothing could change
// and nothing read.

const NATIVE_KEY = 'textstack_native_language'
// Same key the web app uses, for the same reason — see `hasConfirmedLanguage`.
const CONFIRMED_KEY = 'textstack_native_language_confirmed'

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
  setNativeLanguage: (code: string) => void
  /**
   * Whether `nativeLanguage` is something the user actually chose, as opposed to
   * something we guessed. `nativeLanguage` alone cannot answer this: it is never
   * empty — it defaults to 'en' and only *maybe* becomes the device locale — so a
   * reader who has never been asked is indistinguishable from one who genuinely
   * reads English natively. That ambiguity is the whole bug: a QA account showed
   * "I know: English / Learning: English" with `nativeLanguage: null` on the
   * server, and translation quietly became English → English.
   *
   * Null while the answer is still being read from AsyncStorage. Callers that
   * gate UI on "has not chosen yet" must wait for a boolean rather than treating
   * null as false, or they will flash the prompt at every user on every launch.
   */
  hasConfirmedLanguage: boolean | null
  /** Record that the choice was made without changing the language itself. */
  markLanguageConfirmed: () => void
}

const NativeLanguageContext = createContext<NativeLanguageContextValue>({
  nativeLanguage: 'en',
  setNativeLanguage: () => {},
  hasConfirmedLanguage: null,
  markLanguageConfirmed: () => {},
})

export function NativeLanguageProvider({ children }: { children: ReactNode }) {
  const [nativeLanguage, setNativeState] = useState('en')
  // null until AsyncStorage answers — see the interface docblock for why the
  // tri-state matters to callers.
  const [hasConfirmedLanguage, setConfirmedState] = useState<boolean | null>(null)
  const { user, getAccessToken, updateUser } = useAuth()
  const prevUserIdRef = useRef<string | undefined>(user?.id)
  // Set once the server→local mirror has applied an authoritative value, so the
  // (async) AsyncStorage load below can't clobber it back on a cold launch where
  // the two resolve in an arbitrary order.
  const serverLangAppliedRef = useRef(false)

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(NATIVE_KEY),
      AsyncStorage.getItem(CONFIRMED_KEY),
    ]).then(([native, confirmed]) => {
      // Resolve the tri-state first and unconditionally: a failed read must still
      // land on `false` (below, in .catch) rather than leaving it null forever,
      // or anything gated on it hangs.
      setConfirmedState(confirmed === '1')
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
    }).catch(() => { setConfirmedState(false) })
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
        // The value just became a guess again, so the claim that someone chose it
        // has to go with it — otherwise the next account inherits a confirmation
        // it never gave and is never asked.
        setConfirmedState(false)
        serverLangAppliedRef.current = false
        AsyncStorage.removeItem(CONFIRMED_KEY).catch(() => {})
      }
      return
    }
    if (user.isGuest) return
    const serverLang = user.nativeLanguage
    if (!serverLang || !isSupported(serverLang)) return
    serverLangAppliedRef.current = true
    setNativeState(serverLang)   // idempotent — React skips if unchanged
    // A value on the server is a choice the user made, on some device, at some
    // point. Honour it as confirmed so a returning reader is never asked twice.
    //
    // Note what is deliberately NOT done here: web marks *any* signed-in user
    // confirmed even when the server field is empty (apps/web
    // NativeLanguageContext.tsx:108-114), because there it only silences a pulse
    // on an icon. Copying that would silence the onboarding prompt for exactly
    // the users it exists for — the ones the server has no answer for.
    setConfirmedState(true)
    AsyncStorage.multiSet([[NATIVE_KEY, serverLang], [CONFIRMED_KEY, '1']]).catch(() => {})
  }, [user?.id, user?.nativeLanguage, user?.isGuest])

  // Local → server, when the server has no answer. Covers the guest who picks a
  // language and then registers, and the account created before this screen
  // existed. Reads AsyncStorage rather than state because on the register fast
  // path `user.id` changes before a just-written state update has flushed.
  useEffect(() => {
    if (!user || user.isGuest || user.nativeLanguage) return
    let cancelled = false
    ;(async () => {
      try {
        const [confirmed, stored] = await Promise.all([
          AsyncStorage.getItem(CONFIRMED_KEY),
          AsyncStorage.getItem(NATIVE_KEY),
        ])
        if (cancelled || confirmed !== '1' || !stored || !isSupported(stored)) return
        const token = await getAccessToken()
        if (cancelled || !token) return
        const res = await authApi.updateProfile(user.name ?? null, token, stored)
        if (!cancelled && res?.user) await updateUser(res.user)
      } catch {
        // Local value stands; the next sign-in retries this same effect.
      }
    })()
    return () => { cancelled = true }
    // Fires on identity change, not on every local pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.nativeLanguage, user?.isGuest])

  const markLanguageConfirmed = useCallback(() => {
    setConfirmedState(true)
    AsyncStorage.setItem(CONFIRMED_KEY, '1').catch(() => {})
  }, [])

  const setNativeLanguage = useCallback((code: string) => {
    if (!isSupported(code)) return
    setNativeState(code)
    setConfirmedState(true)
    AsyncStorage.multiSet([[NATIVE_KEY, code], [CONFIRMED_KEY, '1']]).catch(() => {})
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

  return (
    <NativeLanguageContext.Provider value={{
      nativeLanguage, setNativeLanguage, hasConfirmedLanguage, markLanguageConfirmed,
    }}>
      {children}
    </NativeLanguageContext.Provider>
  )
}

export function useNativeLanguage() {
  return useContext(NativeLanguageContext)
}
