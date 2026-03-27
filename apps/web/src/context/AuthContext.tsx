import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import {
  User, getCurrentUser, loginWithGoogle, logout as logoutApi, refreshToken,
  loginWithEmail as loginWithEmailApi, registerWithEmail as registerWithEmailApi,
} from '../api/auth'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  googleReady: boolean
  showAuthModal: boolean
  openAuthModal: () => void
  closeAuthModal: () => void
  loginWithEmail: (email: string, password: string) => Promise<void>
  registerWithEmail: (email: string, password: string, name?: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  googleReady: false,
  showAuthModal: false,
  openAuthModal: () => {},
  closeAuthModal: () => {},
  loginWithEmail: async () => {},
  registerWithEmail: async () => {},
  logout: async () => {},
})

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

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

  // Check current auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await getCurrentUser()
        setUser(response.user)
      } catch {
        // Try to refresh token
        try {
          const response = await refreshToken()
          setUser(response.user)
        } catch {
          setUser(null)
        }
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
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

  const logout = useCallback(async () => {
    try {
      await logoutApi()
      setUser(null)
      if (typeof google !== 'undefined') {
        google.accounts.id.disableAutoSelect()
      }
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        googleReady,
        showAuthModal,
        openAuthModal,
        closeAuthModal,
        loginWithEmail,
        registerWithEmail,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
