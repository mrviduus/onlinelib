import { getApiConfig } from './client'
import type { MobileAuthResponse } from '../types/api'

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

export async function logout(accessToken: string): Promise<void> {
  const { baseUrl } = getApiConfig()
  await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}
