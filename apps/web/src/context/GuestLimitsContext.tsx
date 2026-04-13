import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, ReactNode } from 'react'
import { useAuth } from './AuthContext'

interface GuestState {
  pagesRead: number
  practiceSessionsUsed: number
  currentBook: { bookSlug: string; chapterSlug: string } | null
  lastVisitAt: string | null
}

const LIMITS = {
  maxPages: 3,
  maxPracticeSessions: 1,
  commitmentThreshold: 3,  // слов до guest-create (Phase 2)
  nagDays: 3,              // дней до nag banner
} as const

// Legacy key — cleaned up once on mount. Guest state no longer persisted (cookie session is SoT).
const LEGACY_STORAGE_KEY = 'guest.state.v1'

const defaultState: GuestState = {
  pagesRead: 0,
  practiceSessionsUsed: 0,
  currentBook: null,
  lastVisitAt: null,
}

interface GuestLimitsContextValue {
  guestState: GuestState
  limits: typeof LIMITS
  isPageLimitReached: boolean
  isPracticeLimitReached: boolean
  incrementPages: () => boolean
  incrementPractice: () => boolean
  setCurrentBook: (book: GuestState['currentBook']) => void
  isReturningUser: boolean
  shouldShowNag: boolean
  commitmentThreshold: number
  resetGuestState: () => void
}

const GuestLimitsContext = createContext<GuestLimitsContextValue>({
  guestState: defaultState,
  limits: LIMITS,
  isPageLimitReached: false,
  isPracticeLimitReached: false,
  incrementPages: () => true,
  incrementPractice: () => true,
  setCurrentBook: () => {},
  isReturningUser: false,
  shouldShowNag: false,
  commitmentThreshold: LIMITS.commitmentThreshold,
  resetGuestState: () => {},
})

export function GuestLimitsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isGuest, user } = useAuth()
  const [state, setState] = useState<GuestState>(defaultState)

  // One-time cleanup of legacy localStorage key.
  useEffect(() => {
    try { localStorage.removeItem(LEGACY_STORAGE_KEY) } catch {}
  }, [])

  // Update lastVisitAt once on mount for guests
  const lastVisitUpdatedRef = useRef(false)
  useEffect(() => {
    if (!isAuthenticated && !lastVisitUpdatedRef.current) {
      lastVisitUpdatedRef.current = true
      setState(prev => ({ ...prev, lastVisitAt: new Date().toISOString() }))
    }
  }, [isAuthenticated])

  const isPageLimitReached = !isAuthenticated && state.pagesRead >= LIMITS.maxPages
  const isPracticeLimitReached = !isAuthenticated && state.practiceSessionsUsed >= LIMITS.maxPracticeSessions

  const incrementPages = useCallback(() => {
    if (isAuthenticated) return true
    if (state.pagesRead >= LIMITS.maxPages) return false
    setState(prev => ({ ...prev, pagesRead: prev.pagesRead + 1 }))
    return true
  }, [isAuthenticated, state.pagesRead])

  const incrementPractice = useCallback(() => {
    if (isAuthenticated) return true
    if (state.practiceSessionsUsed >= LIMITS.maxPracticeSessions) return false
    setState(prev => ({ ...prev, practiceSessionsUsed: prev.practiceSessionsUsed + 1 }))
    return true
  }, [isAuthenticated, state.practiceSessionsUsed])

  const setCurrentBook = useCallback((book: GuestState['currentBook']) => {
    setState(prev => ({ ...prev, currentBook: book }))
  }, [])

  const isReturningUser = useMemo(
    () => !isAuthenticated && !!state.lastVisitAt && !!state.currentBook,
    [isAuthenticated, state.lastVisitAt, state.currentBook]
  )

  // Nag banner: guest accounts after N days. Source of truth = backend `user.createdAt`
  // (already in User DTO). No client-side counters/localStorage — survives reloads naturally.
  const shouldShowNag = useMemo(() => {
    if (!isAuthenticated || !isGuest || !user?.createdAt) return false
    const createdAtMs = Date.parse(user.createdAt)
    if (!Number.isFinite(createdAtMs)) return false
    const days = (Date.now() - createdAtMs) / 86_400_000
    return days >= LIMITS.nagDays
  }, [isAuthenticated, isGuest, user?.createdAt])

  const resetGuestState = useCallback(() => {
    setState(defaultState)
  }, [])

  return (
    <GuestLimitsContext.Provider value={{
      guestState: state,
      limits: LIMITS,
      isPageLimitReached,
      isPracticeLimitReached,
      incrementPages,
      incrementPractice,
      setCurrentBook,
      isReturningUser,
      shouldShowNag,
      commitmentThreshold: LIMITS.commitmentThreshold,
      resetGuestState,
    }}>
      {children}
    </GuestLimitsContext.Provider>
  )
}

export function useGuestLimits() {
  return useContext(GuestLimitsContext)
}
