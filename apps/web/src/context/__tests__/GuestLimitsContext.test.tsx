import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// --- Mock AuthContext to control isAuthenticated / isGuest / user.createdAt from tests ---

const authState: {
  isAuthenticated: boolean
  isGuest: boolean
  user: { createdAt: string } | null
} = { isAuthenticated: false, isGuest: false, user: null }

vi.mock('../AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: authState.isAuthenticated,
    isGuest: authState.isGuest,
    user: authState.user,
  }),
}))

import { GuestLimitsProvider, useGuestLimits } from '../GuestLimitsContext'

function wrapper({ children }: { children: React.ReactNode }) {
  return <GuestLimitsProvider>{children}</GuestLimitsProvider>
}

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()

describe('GuestLimitsContext.shouldShowNag', () => {
  beforeEach(() => {
    authState.isAuthenticated = false
    authState.isGuest = false
    authState.user = null
  })

  it('is false for anonymous users', () => {
    authState.isAuthenticated = false
    authState.isGuest = false
    const { result } = renderHook(() => useGuestLimits(), { wrapper })
    expect(result.current.shouldShowNag).toBe(false)
  })

  it('is false for registered (non-guest) users regardless of age', () => {
    authState.isAuthenticated = true
    authState.isGuest = false
    authState.user = { createdAt: daysAgo(30) }
    const { result } = renderHook(() => useGuestLimits(), { wrapper })
    expect(result.current.shouldShowNag).toBe(false)
  })

  it('is false for fresh guest (<3 days old)', () => {
    authState.isAuthenticated = true
    authState.isGuest = true
    authState.user = { createdAt: daysAgo(1) }
    const { result } = renderHook(() => useGuestLimits(), { wrapper })
    expect(result.current.shouldShowNag).toBe(false)
  })

  it('is true for guest account >= 3 days old', () => {
    authState.isAuthenticated = true
    authState.isGuest = true
    authState.user = { createdAt: daysAgo(4) }
    const { result } = renderHook(() => useGuestLimits(), { wrapper })
    expect(result.current.shouldShowNag).toBe(true)
  })

  it('is false when user has no createdAt (edge case, no crash)', () => {
    authState.isAuthenticated = true
    authState.isGuest = true
    authState.user = null
    const { result } = renderHook(() => useGuestLimits(), { wrapper })
    expect(result.current.shouldShowNag).toBe(false)
  })

  it('is false when createdAt is unparsable', () => {
    authState.isAuthenticated = true
    authState.isGuest = true
    authState.user = { createdAt: 'not-a-date' }
    const { result } = renderHook(() => useGuestLimits(), { wrapper })
    expect(result.current.shouldShowNag).toBe(false)
  })

  it('exposes commitmentThreshold = 3', () => {
    const { result } = renderHook(() => useGuestLimits(), { wrapper })
    expect(result.current.commitmentThreshold).toBe(3)
  })
})
