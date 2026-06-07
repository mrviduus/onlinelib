import { getApiConfig } from './client'
import type { MobileAuthResponse, AuthResponse } from '../types/api'

async function mobilePost<T>(path: string, body: unknown): Promise<T> {
  const { baseUrl } = getApiConfig()
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client': 'mobile' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw Object.assign(new Error(data?.error || `Request failed: ${res.status}`), { status: res.status })
  }
  return res.json()
}

export async function loginWithGoogle(idToken: string): Promise<MobileAuthResponse> {
  return mobilePost('/auth/google', { idToken })
}

export async function loginWithApple(
  identityToken: string,
  fullName?: string | null,
  email?: string | null,
): Promise<MobileAuthResponse> {
  return mobilePost('/auth/apple', { identityToken, fullName, email })
}

export async function refreshTokenMobile(refreshToken: string): Promise<MobileAuthResponse> {
  const { baseUrl } = getApiConfig()
  const res = await fetch(`${baseUrl}/auth/refresh-mobile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
  if (!res.ok) throw new Error('Token refresh failed')
  return res.json()
}

export async function registerWithEmail(
  email: string,
  password: string,
  name?: string,
): Promise<MobileAuthResponse> {
  try {
    return await mobilePost('/auth/register', { email, password, name: name || null })
  } catch (e: any) {
    if (e.status === 409) throw new Error('An account with this email already exists.')
    if (e.status === 400) throw new Error(e.message || 'Invalid email or password.')
    throw new Error('Registration failed')
  }
}

export async function loginWithEmail(
  email: string,
  password: string,
): Promise<MobileAuthResponse> {
  try {
    return await mobilePost('/auth/login', { email, password })
  } catch (e: any) {
    if (e.status === 401) throw new Error('Invalid email or password.')
    throw new Error('Login failed')
  }
}

export async function forgotPassword(email: string): Promise<void> {
  const { baseUrl } = getApiConfig()
  await fetch(`${baseUrl}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const { baseUrl } = getApiConfig()
  const res = await fetch(`${baseUrl}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw Object.assign(new Error(data?.error || 'Reset failed.'), { status: res.status })
  }
}

export async function logout(accessToken: string): Promise<void> {
  const { baseUrl } = getApiConfig()
  await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

// Profile. `nativeLanguage` is optional: omit it to leave the field untouched
// (the backend treats a missing NativeLanguage as "don't change"), pass a code to
// set it, or '' to clear it. Lets mobile persist the user's native language so it
// follows them across devices (parity with the web reader).
export async function updateProfile(
  name: string | null,
  accessToken: string,
  nativeLanguage?: string | null,
): Promise<AuthResponse> {
  const { baseUrl } = getApiConfig()
  const body: { name: string | null; nativeLanguage?: string | null } = { name }
  if (nativeLanguage !== undefined) body.nativeLanguage = nativeLanguage
  const res = await fetch(`${baseUrl}/me/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Failed to update profile')
  return res.json()
}

// Fetch the current user (incl. nativeLanguage). Lets a client refresh a stale
// cached user — mobile calls this on launch so a native language set on another
// device shows up without re-login.
export async function getProfile(accessToken: string): Promise<AuthResponse> {
  const { baseUrl } = getApiConfig()
  const res = await fetch(`${baseUrl}/me/profile`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch profile')
  return res.json()
}

export async function uploadAvatar(imageUri: string, accessToken: string): Promise<AuthResponse> {
  const { baseUrl } = getApiConfig()
  const formData = new FormData()
  const filename = imageUri.split('/').pop() || 'avatar.jpg'
  const ext = filename.split('.').pop()?.toLowerCase() || 'jpg'
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg'
  formData.append('file', { uri: imageUri, name: filename, type: mimeType } as any)
  const res = await fetch(`${baseUrl}/me/profile/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    // Attach the HTTP status so callers can render granular copy
    // (413 → "too large", 415 → "wrong format", etc.) instead of a
    // single generic "Upload failed" (B-20). Kept as a property rather
    // than a subclass to avoid breaking existing `catch (e) { e.message }`
    // callers in web + tests.
    const err = new Error(data?.error || 'Upload failed') as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return res.json()
}

export async function deleteAvatar(accessToken: string): Promise<void> {
  const { baseUrl } = getApiConfig()
  const res = await fetch(`${baseUrl}/me/profile/avatar`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to delete avatar')
}
