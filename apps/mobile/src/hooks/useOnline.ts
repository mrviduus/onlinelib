import { useEffect, useRef, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'

/**
 * Connectivity, in the two shapes screens actually need.
 *
 * `useOnline()` answers "should I assume there is a network right now" and
 * coerces the unknown initial state to `true`, which is the right default for
 * deciding whether to show a warning.
 *
 * That coercion makes the transition invisible, though, and the transition is
 * what a stale screen needs. QA turned airplane mode off and Discover kept its
 * "You're offline" banner until the app was restarted: the banner is cleared
 * only by a successful re-run of a fetch whose dependency list is `[language]`,
 * and a tab screen never unmounts. Nothing was listening for the network coming
 * back, because nothing could express it.
 *
 * `useReconnectCount()` is that signal — a counter that increments on every
 * false → true edge, suitable for a dependency array.
 */
export function useOnline(): boolean {
  return useOnlineState() !== false
}

/**
 * The raw tri-state: `null` until NetInfo answers, then the truth.
 *
 * Prefer `useOnline()` unless you genuinely need to tell "not yet known" from
 * "offline" — treating them the same is what a UI usually wants and what a
 * reload trigger usually does not.
 */
export function useOnlineState(): boolean | null {
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    const apply = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      const reachable = state.isInternetReachable
      setOnline(reachable === null ? !!state.isConnected : reachable)
    }
    NetInfo.fetch().then(apply)
    const unsubscribe = NetInfo.addEventListener(apply)
    return unsubscribe
  }, [])

  return online
}

/**
 * Increments once each time the device comes back online.
 *
 * Put it in a dependency array to refetch on reconnect. It counts edges rather
 * than exposing a boolean so that a consumer re-runs on the transition and not
 * on every render where the answer happens to be `true`.
 *
 * The first settle does NOT count: NetInfo starts at `null`, and `null → true`
 * on launch is not a reconnection — treating it as one fires a second fetch
 * immediately after the first on every cold start.
 */
export function useReconnectCount(): number {
  const online = useOnlineState()
  const [count, setCount] = useState(0)
  const wasOffline = useRef(false)

  useEffect(() => {
    if (online === false) {
      wasOffline.current = true
      return
    }
    if (online === true && wasOffline.current) {
      wasOffline.current = false
      setCount(c => c + 1)
    }
  }, [online])

  return count
}
