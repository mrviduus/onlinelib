import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react'
import {
  User, getCurrentUser, loginWithGoogle, logout as logoutApi, refreshToken,
  loginWithEmail as loginWithEmailApi, registerWithEmail as registerWithEmailApi,
  updateProfile as updateProfileApi, uploadAvatar as uploadAvatarApi, deleteAvatar as deleteAvatarApi,
  createGuestSession as createGuestSessionApi,
} from '../api/auth'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  isGuest: boolean
  googleReady: boolean
  showAuthModal: boolean
  openAuthModal: () => void
  closeAuthModal: () => void
  loginWithEmail: (email: string, password: string) => Promise<void>
  registerWithEmail: (email: string, password: string, name?: string) => Promise<void>
  /** Resolves once the initial session bootstrap has settled (auth, refresh, or guest). Never rejects. */
  waitForSession: () => Promise<void>
  ensureSession: () => Promise<void>
  logout: () => Promise<void>
  updateProfile: (name: string | null) => Promise<void>
  updateAvatar: (file: File) => Promise<void>
  deleteAvatar: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  isGuest: false,
  googleReady: false,
  showAuthModal: false,
  openAuthModal: () => {},
  closeAuthModal: () => {},
  loginWithEmail: async () => {},
  registerWithEmail: async () => {},
  waitForSession: async () => {},
  ensureSession: async () => {},
  logout: async () => {},
  updateProfile: async () => {},
  updateAvatar: async () => {},
  deleteAvatar: async () => {},
})

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

/** Hard ceiling on how long waitForSession waits for bootstrap to settle. */
const SESSION_BOOTSTRAP_TIMEOUT_MS = 15_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [googleReady, setGoogleReady] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)

  // Google callback - stable ref to avoid stale closures
  const handleGoogleCallback = useCallback(async (response: google.accounts.id.CredentialResponse) => {
    try {
      setIsLoading(true)
      const authResponse = await loginWithGoogle(response.credential)
      setUser(authResponse.user)
      setShowAuthModal(false)
    } catch (error) {
      console.error('Login failed:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Session-ready gate: resolves once the initial auth/refresh/guest-create attempt has settled.
  // Consumers (e.g. reader vocab save) await this before deciding to hit auth-gated APIs.
  const sessionReadyRef = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null)
  if (!sessionReadyRef.current) {
    let resolveFn: () => void = () => {}
    const promise = new Promise<void>((r) => { resolveFn = r })
    sessionReadyRef.current = { promise, resolve: resolveFn }
  }
  // waitForSession races the bootstrap promise with a hard timeout so it can never hang.
  const waitForSession = useCallback(async () => {
    await Promise.race([
      sessionReadyRef.current!.promise,
      new Promise<void>((r) => setTimeout(r, SESSION_BOOTSTRAP_TIMEOUT_MS)),
    ])
  }, [])

  // Single-flight guard for POST /auth/guest. Shared by ensureSession and logout
  // so concurrent callers (StrictMode double-invoke, logout race, HeroSection upload) dedupe into one call.
  const inFlightGuestRef = useRef<Promise<User | null> | null>(null)
  const createGuestOnce = useCallback(async (): Promise<User | null> => {
    if (inFlightGuestRef.current) return inFlightGuestRef.current
    const promise = createGuestSessionApi()
      .then((res) => {
        // I3: no-downgrade — не перетираем не-guest юзера.
        // Race: login мог завершиться пока guest-промис был in-flight.
        setUser(prev => (prev && !prev.isGuest ? prev : res.user))
        return res.user
      })
      .catch(() => {
        // Падение guest-create не должно трогать существующего юзера.
        setUser(prev => (prev && !prev.isGuest ? prev : null))
        return null
      })
      .finally(() => { inFlightGuestRef.current = null })
    inFlightGuestRef.current = promise
    return promise
  }, [])

  // StrictMode fires effects twice in dev; this ref dedupes the bootstrap so we never hit /auth/guest twice.
  const bootstrapStartedRef = useRef(false)

  // I1: Bootstrap = read-only session probe. Проверяем существующую сессию, но
  // НЕ создаём guest. Guest создаётся demand-driven (ensureSession → первый tap
  // слова в reader или upload книги). Homepage/login/каталог не триггерят /auth/guest.
  useEffect(() => {
    if (bootstrapStartedRef.current) return
    bootstrapStartedRef.current = true

    const sessionReady = sessionReadyRef.current!
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const timeoutPromise = new Promise<void>((r) => {
      timeoutId = setTimeout(r, SESSION_BOOTSTRAP_TIMEOUT_MS)
    })

    const bootstrap = async () => {
      try {
        const response = await getCurrentUser()
        setUser(response.user)
      } catch {
        try {
          const response = await refreshToken()
          setUser(response.user)
        } catch {
          // I1: bootstrap read-only. user остаётся null; фичи сами зовут ensureSession().
        }
      }
    }

    ;(async () => {
      try {
        await Promise.race([bootstrap(), timeoutPromise])
      } finally {
        if (timeoutId) clearTimeout(timeoutId)
        setIsLoading(false)
        sessionReady.resolve()
      }
    })()
  }, [])

  // Load and initialize Google Sign-In in single effect
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || googleReady) return

    const initGoogle = async () => {
      // Skip Google Identity for bots
      const isBot = /googlebot|bingbot|yandex|baiduspider|facebookexternalhit|twitterbot|linkedinbot|whatsapp|applebot|semrush|ahrefs/i.test(navigator.userAgent)
      if (isBot) return

      // Load script if not present
      if (!document.getElementById('google-signin-script')) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.id = 'google-signin-script'
          script.src = 'https://accounts.google.com/gsi/client'
          script.async = true
          script.defer = true
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Failed to load Google Sign-In'))
          document.head.appendChild(script)
        })
      }

      // Initialize Google Sign-In
      if (typeof google !== 'undefined' && google.accounts?.id) {
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCallback,
          auto_select: false,
          cancel_on_tap_outside: true,
        })
        setGoogleReady(true)
      }
    }

    initGoogle().catch(err => console.error('[Auth] Failed to init Google:', err))
  }, [handleGoogleCallback, googleReady])

  const openAuthModal = useCallback(() => setShowAuthModal(true), [])
  const closeAuthModal = useCallback(() => setShowAuthModal(false), [])

  const authenticateAndClose = useCallback(async (apiCall: () => Promise<{ user: User }>) => {
    const response = await apiCall()
    setUser(response.user)
    setShowAuthModal(false)
  }, [])

  const loginWithEmail = useCallback(
    (email: string, password: string) => authenticateAndClose(() => loginWithEmailApi(email, password)),
    [authenticateAndClose],
  )

  const registerWithEmail = useCallback(
    (email: string, password: string, name?: string) => authenticateAndClose(() => registerWithEmailApi(email, password, name)),
    [authenticateAndClose],
  )

  const updateProfile = useCallback(async (name: string | null) => {
    const response = await updateProfileApi(name)
    setUser(response.user)
  }, [])

  const updateAvatar = useCallback(async (file: File) => {
    const response = await uploadAvatarApi(file)
    setUser(response.user)
  }, [])

  const deleteAvatar = useCallback(async () => {
    await deleteAvatarApi()
    setUser(prev => prev ? { ...prev, picture: null } : null)
  }, [])

  // Public: create a guest session if not authenticated. Routes through the single-flight
  // helper so concurrent callers (e.g. HeroSection upload + bootstrap) share one network call.
  const ensureSession = useCallback(async () => {
    if (user) return
    await createGuestOnce()
  }, [user, createGuestOnce])

  const logout = useCallback(async () => {
    try {
      await logoutApi()
      if (typeof google !== 'undefined') {
        google.accounts.id.disableAutoSelect()
      }
      // I5: явно сбрасываем user перед guest re-create, иначе I3-guard в
      // createGuestOnce увидит старого залогиненного юзера и не обновит state.
      setUser(null)
      // Create a new guest session so reader-driven flows don't break.
      await createGuestOnce()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }, [createGuestOnce])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isGuest: user?.isGuest ?? false,
        googleReady,
        showAuthModal,
        openAuthModal,
        closeAuthModal,
        loginWithEmail,
        registerWithEmail,
        waitForSession,
        ensureSession,
        logout,
        updateProfile,
        updateAvatar,
        deleteAvatar,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
