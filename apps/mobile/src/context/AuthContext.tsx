import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { Platform } from 'react-native'
import type { UserDto } from '@textstack/shared'
import { onAuthFailure } from '../lib/authEvents'
import { resetAuthFailureLatch } from '../lib/api'
import { clearVocabStatsCache } from '../lib/vocabStatsCache'
import { clearAllLocalProgress } from '../lib/progressStorage'
import { clearReaderCache } from '../lib/readerOfflineCache'

// Lazy import so the Google module isn't pulled on platforms / contexts
// that don't ship it (e.g. Expo Go web preview, where this package may
// not be installed yet). Lives in a try/catch because the module's
// presence is not guaranteed across all build flavors.
let googleSigninModule: { GoogleSignin?: { signOut?: () => Promise<unknown> } } | null = null
if (Platform.OS !== 'web') {
  try {
    googleSigninModule = require('@react-native-google-signin/google-signin')
  } catch {
    googleSigninModule = null
  }
}

// Storage shim: native → expo-secure-store, web → localStorage.
//
// Previously each method called `require('expo-secure-store')` lazily on
// every call — extra work per auth op and a pathological crash risk if
// the module is missing. Now resolved once at module load behind a
// Platform guard (B-08). On web we keep a localStorage path (checked for
// existence because SSR is theoretically possible).
type NativeSecureStore = {
  getItemAsync: (key: string) => Promise<string | null>
  setItemAsync: (key: string, value: string) => Promise<void>
  deleteItemAsync: (key: string) => Promise<void>
}

let nativeStore: NativeSecureStore | null = null
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    nativeStore = require('expo-secure-store') as NativeSecureStore
  } catch (err) {
    console.error('[auth] expo-secure-store unavailable — falling back to in-memory store. Sessions will NOT persist.', err)
  }
}

const hasWebStorage = typeof globalThis !== 'undefined' && typeof (globalThis as any).localStorage !== 'undefined'

// In-memory fallback so the app doesn't crash if both stores are
// unavailable. Sessions won't persist across reload, but tokens still
// work within the current app lifetime.
const memStore = new Map<string, string>()

const SecureStore = {
  async getItemAsync(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return hasWebStorage ? (globalThis as any).localStorage.getItem(key) : (memStore.get(key) ?? null)
    }
    if (nativeStore) return nativeStore.getItemAsync(key)
    return memStore.get(key) ?? null
  },
  async setItemAsync(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (hasWebStorage) (globalThis as any).localStorage.setItem(key, value)
      else memStore.set(key, value)
      return
    }
    if (nativeStore) return nativeStore.setItemAsync(key, value)
    memStore.set(key, value)
  },
  async deleteItemAsync(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (hasWebStorage) (globalThis as any).localStorage.removeItem(key)
      else memStore.delete(key)
      return
    }
    if (nativeStore) return nativeStore.deleteItemAsync(key)
    memStore.delete(key)
  },
}

interface AuthState {
  user: UserDto | null
  isAuthenticated: boolean
  isLoading: boolean
  signInWithTokens: (accessToken: string, refreshToken: string, user: UserDto) => Promise<void>
  updateUser: (user: UserDto) => Promise<void>
  getAccessToken: () => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  signInWithTokens: async () => {},
  updateUser: async () => {},
  getAccessToken: async () => null,
  signOut: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const userRef = useRef<UserDto | null>(null)
  userRef.current = user

  // Restore session on mount
  useEffect(() => {
    ;(async () => {
      try {
        const stored = await SecureStore.getItemAsync('user')
        if (stored) {
          setUser(JSON.parse(stored))
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  const signInWithTokens = useCallback(
    async (accessToken: string, refreshToken: string, userData: UserDto) => {
      await SecureStore.setItemAsync('access_token', accessToken)
      await SecureStore.setItemAsync('refresh_token', refreshToken)
      await SecureStore.setItemAsync('user', JSON.stringify(userData))
      // Fresh session — allow the next terminal auth failure to fire
      // again (the latch is one-shot per session).
      resetAuthFailureLatch()
      setUser(userData)
    },
    [],
  )

  const updateUser = useCallback(async (userData: UserDto) => {
    await SecureStore.setItemAsync('user', JSON.stringify(userData))
    setUser(userData)
  }, [])

  const getAccessToken = useCallback(async () => {
    return SecureStore.getItemAsync('access_token')
  }, [])

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync('access_token')
    await SecureStore.deleteItemAsync('refresh_token')
    await SecureStore.deleteItemAsync('user')
    // Without this the Google SDK keeps the previously-selected account
    // cached and the next "Continue with Google" silently signs the
    // same user back in — no account picker, no way to switch users.
    // Wrap in try/catch because signOut() throws if the user wasn't
    // signed in via Google in the first place (email-only / Apple paths).
    try { await googleSigninModule?.GoogleSignin?.signOut?.() } catch {}
    // Per-user AsyncStorage caches must not leak into the next session —
    // otherwise a fresh sign-in briefly shows the previous user's
    // vocabulary stats on the home card while the network fetch races,
    // and (worse) opens books on the previous user's last page. Server
    // progress trumps local on the next flush, but the brief window is
    // visible and confusing.
    clearVocabStatsCache().catch(() => {})
    clearAllLocalProgress().catch(() => {})
    clearReaderCache().catch(() => {})
    setUser(null)
  }, [])

  // React to terminal auth failures from the API layer. The emitter is
  // latched in `api.ts` so we only see one event per expired session,
  // even if 20 hooks fired 20 concurrent 401s.
  useEffect(() => {
    const unsubscribe = onAuthFailure(() => {
      // Only flip UI state if we still think we're logged in —
      // otherwise the listener is a no-op (e.g. user already signed out
      // manually, or this fired during a background refresh cycle).
      if (userRef.current !== null) {
        SecureStore.deleteItemAsync('user').catch(() => {})
        // Same reasoning as in signOut: avoid Google SDK silently
        // re-authing the same user on the next attempt.
        Promise.resolve()
          .then(() => googleSigninModule?.GoogleSignin?.signOut?.())
          .catch(() => {})
        clearVocabStatsCache().catch(() => {})
        clearAllLocalProgress().catch(() => {})
        clearReaderCache().catch(() => {})
        setUser(null)
      }
    })
    return unsubscribe
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        signInWithTokens,
        updateUser,
        getAccessToken,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
