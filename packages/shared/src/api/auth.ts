import { getApiConfig } from './client'
import type { MobileAuthResponse } from '../types/api'

export async function loginWithGoogle(idToken: string): Promise<MobileAuthResponse> {
  const { baseUrl } = getApiConfig()
  const res = await fetch(`${baseUrl}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client': 'mobile' },
    body: JSON.stringify({ idToken }),
  })
  if (!res.ok) throw new Error('Google login failed')
  return res.json()
}

export async function loginWithApple(
  identityToken: string,
  fullName?: string | null,
  email?: string | null,
): Promise<MobileAuthResponse> {
  const { baseUrl } = getApiConfig()
  const res = await fetch(`${baseUrl}/auth/apple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client': 'mobile' },
    body: JSON.stringify({ identityToken, fullName, email }),
  })
  if (!res.ok) throw new Error('Apple login failed')
  return res.json()
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

export async function logout(accessToken: string): Promise<void> {
  const { baseUrl } = getApiConfig()
  await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}
