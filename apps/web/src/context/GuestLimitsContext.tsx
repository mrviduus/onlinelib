import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, ReactNode } from 'react'
import { useAuth } from './AuthContext'

interface GuestState {
  currentBook: { bookSlug: string; chapterSlug: string } | null
  lastVisitAt: string | null
}

// Guests are NOT rate-limited by the client. `POST /auth/guest` is minted on
// demand and the account is promoted in place on register, so there is nothing
// to meter — the marketing copy in locales/en.json promises exactly that.
// The one number left is a UX threshold, not a limit: how many words a reader
// saves locally before we mint the session behind them.
const COMMITMENT_THRESHOLD = 3

// Legacy key — cleaned up once on mount. Guest state no longer persisted (cookie session is SoT).
const LEGACY_STORAGE_KEY = 'guest.state.v1'

const defaultState: GuestState = {
  currentBook: null,
  lastVisitAt: null,
}

interface GuestLimitsContextValue {
  guestState: GuestState
  setCurrentBook: (book: GuestState['currentBook']) => void
  isReturningUser: boolean
  commitmentThreshold: number
}

const GuestLimitsContext = createContext<GuestLimitsContextValue>({
  guestState: defaultState,
  setCurrentBook: () => {},
  isReturningUser: false,
  commitmentThreshold: COMMITMENT_THRESHOLD,
})

export function GuestLimitsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
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

  const setCurrentBook = useCallback((book: GuestState['currentBook']) => {
    setState(prev => ({ ...prev, currentBook: book }))
  }, [])

  const isReturningUser = useMemo(
    () => !isAuthenticated && !!state.lastVisitAt && !!state.currentBook,
    [isAuthenticated, state.lastVisitAt, state.currentBook]
  )

  return (
    <GuestLimitsContext.Provider value={{
      guestState: state,
      setCurrentBook,
      isReturningUser,
      commitmentThreshold: COMMITMENT_THRESHOLD,
    }}>
      {children}
    </GuestLimitsContext.Provider>
  )
}

export function useGuestLimits() {
  return useContext(GuestLimitsContext)
}
