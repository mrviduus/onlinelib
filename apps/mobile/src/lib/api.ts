import { Platform } from 'react-native'
import { initApi, type ApiConfig } from '@textstack/shared'

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

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://textstack.app/api'

let refreshPromise: Promise<string | null> | null = null

async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync('access_token')
}

async function onUnauthorized(): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync('refresh_token')
      if (!refreshToken) return null

      const res = await fetch(`${API_URL}/auth/refresh-mobile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })

      if (!res.ok) {
        await SecureStore.deleteItemAsync('access_token')
        await SecureStore.deleteItemAsync('refresh_token')
        return null
      }

      const data = await res.json()
      await SecureStore.setItemAsync('access_token', data.accessToken)
      await SecureStore.setItemAsync('refresh_token', data.refreshToken)
      return data.accessToken as string
    } catch {
      return null
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export function setupApi() {
  initApi({ baseUrl: API_URL, getAccessToken, onUnauthorized })
}

export { API_URL }
