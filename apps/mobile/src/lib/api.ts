import { Platform } from 'react-native'
import { initApi } from '@textstack/shared'
import { emitAuthFailure } from './authEvents'

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

/**
 * Single-flight guard: multiple concurrent 401s share one refresh call.
 * Without this the server would invalidate the first rotated refresh
 * token mid-flight and the second caller would get stuck in a loop.
 */
let refreshPromise: Promise<string | null> | null = null

/**
 * True once we've emitted an auth-failure for the *current* session.
 * Prevents floods of signOut()s when 20 hooks all fire after a stale
 * token. Reset on successful refresh or explicit sign-in.
 */
let authFailureLatched = false

/**
 * Read the current Bearer access token. Exported so a future PDF WebView bootstrap
 * (ADR-012 S4b) can inject it into pdf.js `httpHeaders` — mobile has no cookies, so
 * the Original-layout viewer authenticates the file fetch via this token. Behavior
 * (and the shared client's single-flight refresh via `onUnauthorized`) is unchanged.
 */
export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync('access_token')
}

/** Clears tokens and notifies the AuthContext (once) that the session is gone. */
async function handleTerminalAuthFailure(): Promise<void> {
  await SecureStore.deleteItemAsync('access_token').catch(() => {})
  await SecureStore.deleteItemAsync('refresh_token').catch(() => {})
  if (!authFailureLatched) {
    authFailureLatched = true
    emitAuthFailure()
  }
}

async function onUnauthorized(): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync('refresh_token')
      if (!refreshToken) {
        await handleTerminalAuthFailure()
        return null
      }

      let res: Response
      try {
        res = await fetch(`${API_URL}/auth/refresh-mobile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
      } catch {
        // Network failure — keep the refresh token around so a retry
        // when we're back online can still succeed. Do NOT clear tokens
        // and do NOT emit a terminal auth failure.
        return null
      }

      if (!res.ok) {
        // Explicit rejection by the server (401/403/410) — session is
        // really gone. Wipe tokens and tell the UI.
        if (res.status >= 400 && res.status < 500) {
          await handleTerminalAuthFailure()
        }
        return null
      }

      const data = await res.json()
      await SecureStore.setItemAsync('access_token', data.accessToken)
      await SecureStore.setItemAsync('refresh_token', data.refreshToken)
      authFailureLatched = false
      return data.accessToken as string
    } catch {
      return null
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

/** Reset the latch so a re-login in the same process can trigger signOut again later. */
export function resetAuthFailureLatch(): void {
  authFailureLatched = false
}

export function setupApi() {
  initApi({ baseUrl: API_URL, getAccessToken, onUnauthorized })
}

/**
 * Permanently delete the signed-in user and ALL their data
 * (`DELETE /me/account` → 204). Irreversible. The caller is responsible
 * for signing the user out on success. The Bearer token is passed
 * explicitly (same pattern as `authApi.logout`/`deleteAvatar`) so this
 * works regardless of the shared client's getAccessToken wiring.
 */
export async function deleteAccount(accessToken: string): Promise<void> {
  const res = await fetch(`${API_URL}/me/account`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw Object.assign(
      new Error(data?.error || `Failed to delete account: ${res.status}`),
      { status: res.status },
    )
  }
}

// AI agent endpoints (Tutor "Smart session" + Librarian "Ask the librarian"). Implemented in ./agents on top of
// the shared `authFetch` (Bearer auth, base URL, error/status handling) — re-exported here so callers reach them
// through the consolidated api module, alongside the request types.
export {
  startTutorSession,
  sendTutorFeedback,
  askLibrarian,
  isValidLibrarianQuery,
} from './agents'
export type {
  TutorPlanItem,
  TutorSessionResponse,
  TutorFeedbackResult,
  LibrarianSource,
  LibrarianRecommendation,
  LibrarianResponse,
} from './agents'

export { API_URL }
