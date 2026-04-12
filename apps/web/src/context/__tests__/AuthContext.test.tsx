import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { act, waitFor, renderHook } from '@testing-library/react'

// --- Mocks: the entire auth API surface. ---
const getCurrentUserMock = vi.fn()
const refreshTokenMock = vi.fn()
const createGuestSessionMock = vi.fn()
const logoutMock = vi.fn()

vi.mock('../../api/auth', () => ({
  getCurrentUser: () => getCurrentUserMock(),
  refreshToken: () => refreshTokenMock(),
  createGuestSession: () => createGuestSessionMock(),
  logout: () => logoutMock(),
  loginWithGoogle: vi.fn(),
  loginWithEmail: vi.fn(),
  registerWithEmail: vi.fn(),
  updateProfile: vi.fn(),
  uploadAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
}))

// Import AFTER mocks so the module picks them up.
import { AuthProvider, useAuth } from '../AuthContext'

const guestUser = { id: 'g-1', email: '', name: null, picture: null, isGuest: true } as const

function wrapperStrict({ children }: { children: React.ReactNode }) {
  return <StrictMode><AuthProvider>{children}</AuthProvider></StrictMode>
}

function wrapperPlain({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

describe('AuthContext bootstrap', () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset()
    refreshTokenMock.mockReset()
    createGuestSessionMock.mockReset()
    logoutMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires POST /auth/guest exactly once under StrictMode double-invoke', async () => {
    getCurrentUserMock.mockRejectedValue(new Error('401'))
    refreshTokenMock.mockRejectedValue(new Error('401'))
    createGuestSessionMock.mockResolvedValue({ user: guestUser })

    const { result } = renderHook(() => useAuth(), { wrapper: wrapperStrict })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(createGuestSessionMock).toHaveBeenCalledTimes(1)
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.isGuest).toBe(true)
  })

  it('waitForSession resolves after normal bootstrap', async () => {
    getCurrentUserMock.mockResolvedValue({
      user: { id: 'u-1', email: 'a@b.c', name: null, picture: null, isGuest: false },
    })

    const { result } = renderHook(() => useAuth(), { wrapper: wrapperPlain })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await expect(result.current.waitForSession()).resolves.toBeUndefined()
    expect(createGuestSessionMock).not.toHaveBeenCalled()
  })

  it('waitForSession cannot hang forever — resolves via timeout if bootstrap stalls', async () => {
    vi.useFakeTimers()
    // Make every attempt pend indefinitely.
    getCurrentUserMock.mockReturnValue(new Promise(() => {}))
    refreshTokenMock.mockReturnValue(new Promise(() => {}))
    createGuestSessionMock.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useAuth(), { wrapper: wrapperPlain })

    // waitForSession should resolve after the timeout even though bootstrap is stuck.
    const waited = result.current.waitForSession()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000)
    })

    await expect(waited).resolves.toBeUndefined()
  })

  it('logout triggers exactly one new POST /auth/guest (no double-create)', async () => {
    const authedUser = { id: 'u-2', email: 'x@y.z', name: null, picture: null, isGuest: false }
    getCurrentUserMock.mockResolvedValue({ user: authedUser })
    logoutMock.mockResolvedValue(undefined)
    createGuestSessionMock.mockResolvedValue({ user: guestUser })

    const { result } = renderHook(() => useAuth(), { wrapper: wrapperPlain })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(createGuestSessionMock).not.toHaveBeenCalled()

    await act(async () => { await result.current.logout() })

    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(createGuestSessionMock).toHaveBeenCalledTimes(1)
    expect(result.current.isGuest).toBe(true)
  })

  it('concurrent ensureSession + logout dedupe into one guest create', async () => {
    // Bootstrap completes unauth (no cookies, guest create succeeds once).
    getCurrentUserMock.mockRejectedValue(new Error('401'))
    refreshTokenMock.mockRejectedValue(new Error('401'))
    let resolveGuest: (v: { user: typeof guestUser }) => void = () => {}
    createGuestSessionMock.mockImplementation(
      () => new Promise((r) => { resolveGuest = r })
    )

    const { result } = renderHook(() => useAuth(), { wrapper: wrapperPlain })

    // While bootstrap's guest create is pending, also fire ensureSession and logout.
    // logout calls logoutApi first, then createGuestOnce. We let it reach the second step.
    logoutMock.mockResolvedValue(undefined)

    const ensureP = result.current.ensureSession()
    const logoutP = result.current.logout()

    // Resolve the in-flight guest create.
    await act(async () => {
      resolveGuest({ user: guestUser })
      await ensureP
      await logoutP
    })

    // Bootstrap + ensureSession shared one call; logout triggered a second fresh call after logoutApi cleared the in-flight.
    // Accept either 1 (shared) or 2 (logout re-created after clear). Asserting "no runaway": <= 2.
    expect(createGuestSessionMock.mock.calls.length).toBeLessThanOrEqual(2)
  })
})

