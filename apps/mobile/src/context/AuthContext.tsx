import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { Platform } from 'react-native'
import type { UserDto } from '@textstack/shared'

// SecureStore shim: native → expo-secure-store, web → localStorage
const SecureStore = {
  getItemAsync: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') return localStorage.getItem(key)
    const mod = require('expo-secure-store')
    return mod.getItemAsync(key)
  },
  setItemAsync: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') { localStorage.setItem(key, value); return }
    const mod = require('expo-secure-store')
    return mod.setItemAsync(key, value)
  },
  deleteItemAsync: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') { localStorage.removeItem(key); return }
    const mod = require('expo-secure-store')
    return mod.deleteItemAsync(key)
  },
}

interface AuthState {
  user: UserDto | null
  isAuthenticated: boolean
  isLoading: boolean
  signInWithTokens: (accessToken: string, refreshToken: string, user: UserDto) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  signInWithTokens: async () => {},
  signOut: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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
      setUser(userData)
    },
    [],
  )

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync('access_token')
    await SecureStore.deleteItemAsync('refresh_token')
    await SecureStore.deleteItemAsync('user')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        signInWithTokens,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
