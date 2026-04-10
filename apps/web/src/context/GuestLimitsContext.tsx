import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, ReactNode } from 'react'
import { useAuth } from './AuthContext'

export interface GuestWord {
  word: string
  translation: string | null
  language: string
  bookSlug: string
  savedAt: string
}

interface GuestState {
  pagesRead: number
  savedWords: GuestWord[]
  practiceSessionsUsed: number
  currentBook: { bookSlug: string; chapterSlug: string } | null
  lastVisitAt: string | null
}

const LIMITS = {
  maxPages: 3,
  maxWords: 10,
  maxPracticeSessions: 1,
} as const

const STORAGE_KEY = 'guest.state.v1'

const defaultState: GuestState = {
  pagesRead: 0,
  savedWords: [],
  practiceSessionsUsed: 0,
  currentBook: null,
  lastVisitAt: null,
}

function loadState(): GuestState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState
    return { ...defaultState, ...JSON.parse(raw) }
  } catch {
    return defaultState
  }
}

function saveState(state: GuestState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* quota exceeded — ignore */ }
}

interface GuestLimitsContextValue {
  guestState: GuestState
  limits: typeof LIMITS
  isPageLimitReached: boolean
  isWordLimitReached: boolean
  isPracticeLimitReached: boolean
  incrementPages: () => boolean
  addGuestWord: (word: GuestWord) => boolean
  incrementPractice: () => boolean
  setCurrentBook: (book: GuestState['currentBook']) => void
  isReturningUser: boolean
  resetGuestState: () => void
}

const GuestLimitsContext = createContext<GuestLimitsContextValue>({
  guestState: defaultState,
  limits: LIMITS,
  isPageLimitReached: false,
  isWordLimitReached: false,
  isPracticeLimitReached: false,
  incrementPages: () => true,
  addGuestWord: () => true,
  incrementPractice: () => true,
  setCurrentBook: () => {},
  isReturningUser: false,
  resetGuestState: () => {},
})

export function GuestLimitsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [state, setState] = useState<GuestState>(loadState)

  // Persist on every change
  useEffect(() => {
    if (!isAuthenticated) {
      saveState(state)
    }
  }, [state, isAuthenticated])

  // Update lastVisitAt once on mount for guests
  const lastVisitUpdatedRef = useRef(false)
  useEffect(() => {
    if (!isAuthenticated && !lastVisitUpdatedRef.current) {
      lastVisitUpdatedRef.current = true
      setState(prev => ({ ...prev, lastVisitAt: new Date().toISOString() }))
    }
  }, [isAuthenticated])

  const isPageLimitReached = !isAuthenticated && state.pagesRead >= LIMITS.maxPages
  const isWordLimitReached = !isAuthenticated && state.savedWords.length >= LIMITS.maxWords
  const isPracticeLimitReached = !isAuthenticated && state.practiceSessionsUsed >= LIMITS.maxPracticeSessions

  const incrementPages = useCallback(() => {
    if (isAuthenticated) return true
    if (state.pagesRead >= LIMITS.maxPages) return false
    setState(prev => ({ ...prev, pagesRead: prev.pagesRead + 1 }))
    return true
  }, [isAuthenticated, state.pagesRead])

  const addGuestWord = useCallback((word: GuestWord) => {
    if (isAuthenticated) return true
    if (state.savedWords.length >= LIMITS.maxWords) return false
    // Avoid duplicates
    if (state.savedWords.some(w => w.word.toLowerCase() === word.word.toLowerCase())) return true
    setState(prev => ({ ...prev, savedWords: [...prev.savedWords, word] }))
    return true
  }, [isAuthenticated, state.savedWords])

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

  const resetGuestState = useCallback(() => {
    setState(defaultState)
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }, [])

  return (
    <GuestLimitsContext.Provider value={{
      guestState: state,
      limits: LIMITS,
      isPageLimitReached,
      isWordLimitReached,
      isPracticeLimitReached,
      incrementPages,
      addGuestWord,
      incrementPractice,
      setCurrentBook,
      isReturningUser,
      resetGuestState,
    }}>
      {children}
    </GuestLimitsContext.Provider>
  )
}

export function useGuestLimits() {
  return useContext(GuestLimitsContext)
}
