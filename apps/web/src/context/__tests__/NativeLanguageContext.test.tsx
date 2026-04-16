import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, waitFor, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// --- Auth mocks — NativeLanguageProvider now consumes useAuth internally. ---
const getCurrentUserMock = vi.fn()
const refreshTokenMock = vi.fn()
const updateProfileMock = vi.fn()

vi.mock('../../api/auth', () => ({
  getCurrentUser: () => getCurrentUserMock(),
  refreshToken: () => refreshTokenMock(),
  createGuestSession: vi.fn(),
  logout: vi.fn(),
  loginWithGoogle: vi.fn(),
  loginWithEmail: vi.fn(),
  registerWithEmail: vi.fn(),
  updateProfile: (...args: unknown[]) => updateProfileMock(...args),
  uploadAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
}))

// Import AFTER the mock so the provider picks up the mocked module.
import { AuthProvider } from '../AuthContext'
import { NativeLanguageProvider, useNativeLanguage } from '../NativeLanguageContext'

const STORAGE_KEY = 'textstack_native_language'
const CONFIRMED_KEY = 'textstack_native_language_confirmed'

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <AuthProvider>
        <NativeLanguageProvider>{children}</NativeLanguageProvider>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('NativeLanguageContext', () => {
  beforeEach(() => {
    localStorage.clear()
    getCurrentUserMock.mockReset()
    refreshTokenMock.mockReset()
    updateProfileMock.mockReset()
    // Default: no active session. Tests that need a user override these.
    getCurrentUserMock.mockRejectedValue(new Error('401'))
    refreshTokenMock.mockRejectedValue(new Error('401'))
  })

  it('setNativeLanguage confirms + persists to localStorage', async () => {
    const { result } = renderHook(() => useNativeLanguage(), { wrapper })
    // Wait for auth bootstrap to settle so the sync effect doesn't race the assert.
    await waitFor(() => expect(result.current.hasConfirmedLanguage).toBe(false))

    act(() => result.current.setNativeLanguage('uk'))

    expect(result.current.nativeLanguage).toBe('uk')
    expect(result.current.hasConfirmedLanguage).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('uk')
    expect(localStorage.getItem(CONFIRMED_KEY)).toBe('1')
  })

  it('markConfirmed sets confirmed without changing language', async () => {
    const { result } = renderHook(() => useNativeLanguage(), { wrapper })
    await waitFor(() => expect(result.current.hasConfirmedLanguage).toBe(false))

    const initialLang = result.current.nativeLanguage
    act(() => result.current.markConfirmed())

    expect(result.current.hasConfirmedLanguage).toBe(true)
    expect(result.current.nativeLanguage).toBe(initialLang)
    expect(localStorage.getItem(CONFIRMED_KEY)).toBe('1')
    // markConfirmed is a soft signal — should NOT overwrite the stored lang.
    expect(localStorage.getItem(STORAGE_KEY)).toBe(null)
  })

  it('unsupported code is ignored', async () => {
    const { result } = renderHook(() => useNativeLanguage(), { wrapper })
    await waitFor(() => expect(result.current.hasConfirmedLanguage).toBe(false))

    const initial = result.current.nativeLanguage
    act(() => result.current.setNativeLanguage('xx-ZZ'))

    expect(result.current.nativeLanguage).toBe(initial)
    expect(result.current.hasConfirmedLanguage).toBe(false)
  })

  it('logged-in user: server nativeLanguage becomes source of truth', async () => {
    getCurrentUserMock.mockResolvedValue({
      user: { id: 'u-1', email: 'x@y.z', name: null, picture: null, isGuest: false, nativeLanguage: 'de' },
    })
    // Preload localStorage with a stale value — server should win.
    localStorage.setItem(STORAGE_KEY, 'fr')
    localStorage.setItem(CONFIRMED_KEY, '1')

    const { result } = renderHook(() => useNativeLanguage(), { wrapper })

    await waitFor(() => expect(result.current.nativeLanguage).toBe('de'))
    expect(result.current.hasConfirmedLanguage).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('de')
    // Pure mirror read — we should NOT be spamming PUT /me/profile back.
    expect(updateProfileMock).not.toHaveBeenCalled()
  })

  it('logged-in user with empty server lang + confirmed local → pushes local to server', async () => {
    getCurrentUserMock.mockResolvedValue({
      user: { id: 'u-1', email: 'x@y.z', name: null, picture: null, isGuest: false, nativeLanguage: null },
    })
    localStorage.setItem(STORAGE_KEY, 'uk')
    localStorage.setItem(CONFIRMED_KEY, '1')
    updateProfileMock.mockResolvedValue({
      user: { id: 'u-1', email: 'x@y.z', name: null, picture: null, isGuest: false, nativeLanguage: 'uk' },
    })

    renderHook(() => useNativeLanguage(), { wrapper })

    await waitFor(() =>
      expect(updateProfileMock).toHaveBeenCalledWith({ nativeLanguage: 'uk' }),
    )
  })

  it('setNativeLanguage by logged-in user fires updateProfile', async () => {
    getCurrentUserMock.mockResolvedValue({
      user: { id: 'u-1', email: 'x@y.z', name: null, picture: null, isGuest: false, nativeLanguage: 'en' },
    })
    updateProfileMock.mockResolvedValue({
      user: { id: 'u-1', email: 'x@y.z', name: null, picture: null, isGuest: false, nativeLanguage: 'fr' },
    })

    const { result } = renderHook(() => useNativeLanguage(), { wrapper })
    await waitFor(() => expect(result.current.nativeLanguage).toBe('en'))

    act(() => result.current.setNativeLanguage('fr'))

    await waitFor(() =>
      expect(updateProfileMock).toHaveBeenCalledWith({ nativeLanguage: 'fr' }),
    )
  })

  it('guest user: setNativeLanguage does NOT hit server', async () => {
    getCurrentUserMock.mockResolvedValue({
      user: { id: 'g-1', email: '', name: null, picture: null, isGuest: true, nativeLanguage: null },
    })

    const { result } = renderHook(() => useNativeLanguage(), { wrapper })
    await waitFor(() => expect(result.current.nativeLanguage).toBeDefined())

    act(() => result.current.setNativeLanguage('pl'))

    expect(result.current.nativeLanguage).toBe('pl')
    expect(updateProfileMock).not.toHaveBeenCalled()
  })
})
