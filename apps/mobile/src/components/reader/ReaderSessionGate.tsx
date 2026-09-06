import { useEffect, useRef, useState, type ReactNode } from 'react'
import { View } from 'react-native'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import type { EnsureSessionResult } from '../../lib/guestSession'
import { readerGateState, READER_SESSION_GATE_TIMEOUT_MS } from '../../lib/readerSessionGate'

/**
 * Settles the session question BEFORE the reader mounts, then gets out of the
 * way.
 *
 * Opening a book is the commitment signal that earns an anonymous session:
 * from here on the reader wants to save progress, highlights and vocabulary,
 * and every one of those writes needs a server row. Minting at app launch
 * instead would spend a session on people who only browsed the catalog.
 *
 * This is a **render** gate rather than an early `ensureSession()` call
 * because `isAuthenticated` is wired into fetch effects, not just display —
 * see the note in `src/lib/readerSessionGate.ts`. Children are passed as
 * elements, so nothing inside them mounts (and no hook inside them runs) until
 * this component actually returns them.
 *
 * The blank is deliberately blank — no spinner. The common case settles in
 * well under 200ms and a spinner that appears and vanishes inside one blink
 * reads as a glitch. On the slow path the reader is about to appear anyway.
 */
export function ReaderSessionGate({ children }: { children: ReactNode }) {
  const { isLoading, ensureSession } = useAuth()
  const { colors } = useTheme()
  const [outcome, setOutcome] = useState<EnsureSessionResult | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const startedRef = useRef(false)

  // The deadline runs from mount, independently of the request, so a socket
  // that hangs open with no answer cannot keep the book closed.
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), READER_SESSION_GATE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    // Runs once per gate mount. `ensureSession` is itself single-flighted, but
    // re-entering here would also reset nothing and cost a render.
    if (startedRef.current) return
    startedRef.current = true
    let cancelled = false
    ensureSession()
      .then((result) => { if (!cancelled) setOutcome(result) })
      // `ensureSession` is documented never to reject; this is the belt for
      // the day that stops being true. A rejection must still open the book.
      .catch((error: unknown) => { if (!cancelled) setOutcome({ status: 'failed', error }) })
    return () => { cancelled = true }
  }, [ensureSession])

  if (readerGateState({ authLoading: isLoading, outcome, timedOut }) === 'wait') {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />
  }

  return <>{children}</>
}
