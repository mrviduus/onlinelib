const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export interface User {
  id: string
  email: string
  name: string | null
  picture: string | null
  isGuest: boolean
  createdAt: string
  /** BCP-47 code of the user's native language. Null until set via ProfileModal
   *  or propagated from a guest session. Source of truth when present. */
  nativeLanguage: string | null
}

export interface AuthResponse {
  user: User
}

async function authFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw Object.assign(new Error(data?.error || `API error: ${res.status}`), { status: res.status })
  }

  const text = await res.text()
  if (!text) return {} as T
  return JSON.parse(text)
}

export async function registerWithEmail(email: string, password: string, name?: string): Promise<AuthResponse> {
  try {
    return await authFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name: name || null }),
    })
  } catch (e: any) {
    if (e.status === 409) throw new Error('An account with this email already exists.')
    if (e.status === 400) throw new Error(e.message || 'Invalid email or password.')
    throw new Error(`Registration failed: ${e.status}`)
  }
}

export async function loginWithEmail(email: string, password: string): Promise<AuthResponse> {
  try {
    return await authFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  } catch (e: any) {
    if (e.status === 401) throw new Error('Invalid email or password.')
    throw new Error(`Login failed: ${e.status}`)
  }
}

export async function forgotPassword(email: string): Promise<void> {
  await authFetch<void>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await authFetch<void>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })
}

export async function loginWithGoogle(idToken: string): Promise<AuthResponse> {
  return authFetch<AuthResponse>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  })
}

export async function refreshToken(): Promise<AuthResponse> {
  return authFetch<AuthResponse>('/auth/refresh', {
    method: 'POST',
  })
}

export async function logout(): Promise<void> {
  await authFetch<void>('/auth/logout', {
    method: 'POST',
  })
}

export async function createGuestSession(): Promise<AuthResponse> {
  return authFetch<AuthResponse>('/auth/guest', { method: 'POST' })
}

export async function getCurrentUser(): Promise<AuthResponse> {
  return authFetch<AuthResponse>('/auth/me')
}

// Device Authorization Grant (RFC 8628, AI-050a) — consent page approves a
// CLI's user_code from the authenticated browser session. authFetch sends
// credentials:'include', so the session cookie authenticates the approval.
export type DeviceApproveError =
  | 'invalid_user_code'
  | 'expired_user_code'
  | 'user_code_already_used'
  | 'invalid_request'

export async function approveDevice(userCode: string): Promise<void> {
  await authFetch<void>('/auth/device/approve', {
    method: 'POST',
    body: JSON.stringify({ user_code: userCode }),
  })
}

export async function denyDevice(userCode: string): Promise<void> {
  await authFetch<void>('/auth/device/deny', {
    method: 'POST',
    body: JSON.stringify({ user_code: userCode }),
  })
}

// Profile API
export interface UpdateProfilePayload {
  name?: string | null
  nativeLanguage?: string | null
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<AuthResponse> {
  return authFetch<AuthResponse>('/me/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function uploadAvatar(file: File): Promise<AuthResponse> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/me/profile/avatar`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error || 'Upload failed')
  }
  return res.json()
}

export async function deleteAvatar(): Promise<void> {
  await authFetch<void>('/me/profile/avatar', { method: 'DELETE' })
}

// Reading Progress API
export interface ReadingProgressDto {
  editionId: string
  chapterId: string
  chapterSlug: string | null
  locator: string
  percent: number | null
  updatedAt: string
}

export interface UpsertProgressRequest {
  chapterId: string
  locator: string
  percent: number | null
  updatedAt?: string
}

export async function getProgress(editionId: string): Promise<ReadingProgressDto | null> {
  try {
    return await authFetch<ReadingProgressDto>(`/me/progress/${editionId}`)
  } catch {
    return null
  }
}

export interface AllProgressResponse {
  total: number
  items: ReadingProgressDto[]
}

export async function getAllProgress(): Promise<AllProgressResponse> {
  return authFetch<AllProgressResponse>('/me/progress')
}

export async function upsertProgress(editionId: string, data: UpsertProgressRequest): Promise<ReadingProgressDto> {
  return authFetch<ReadingProgressDto>(`/me/progress/${editionId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// Mark book as fully read (100%)
export async function markAsRead(editionId: string, chapterId: string): Promise<ReadingProgressDto> {
  return upsertProgress(editionId, {
    chapterId,
    locator: '{"type":"end"}',
    percent: 1,
  })
}

// Mark book as unread (0%)
export async function markAsUnread(editionId: string, chapterId: string): Promise<ReadingProgressDto> {
  return upsertProgress(editionId, {
    chapterId,
    locator: '{"type":"start"}',
    percent: 0,
  })
}

// Library API
export interface LibraryItem {
  editionId: string
  slug: string
  title: string
  language: string
  coverPath: string | null
  createdAt: string
  author: string | null
}

export interface LibraryResponse {
  total: number
  items: LibraryItem[]
}

export async function getLibrary(): Promise<LibraryResponse> {
  return authFetch<LibraryResponse>('/me/library')
}

export async function addToLibrary(editionId: string): Promise<LibraryItem> {
  return authFetch<LibraryItem>(`/me/library/${editionId}`, {
    method: 'POST',
  })
}

export async function removeFromLibrary(editionId: string): Promise<void> {
  await authFetch<void>(`/me/library/${editionId}`, {
    method: 'DELETE',
  })
}
