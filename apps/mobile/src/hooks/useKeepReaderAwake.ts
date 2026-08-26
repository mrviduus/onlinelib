import { useEffect } from 'react'

/**
 * Keeps the screen on while a chapter is open.
 *
 * Without this the display timeout fires mid-page — a slow reader on a 30s
 * timeout gets the screen killed underneath them, repeatedly, in the one
 * activity this app exists for. Every dedicated reader (Kindle, Apple Books,
 * Kobo) holds the screen on while a book is open.
 *
 * Deliberately guarded: `expo-keep-awake` ships as a dependency of `expo`, so
 * its native module is expected to be linked already and this can go out as a
 * JS-only update. If a given binary does NOT carry it, the require throws and
 * we simply do not hold the lock — reading is unaffected. That trade is why
 * this is a lazy require rather than a static import.
 *
 * Scoped to an active chapter, not to the reader screen: a failed load or the
 * PDF error overlay should let the phone sleep normally.
 */
export function useKeepReaderAwake(active: boolean): void {
  useEffect(() => {
    if (!active) return
    let deactivate: (() => void) | null = null
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const KeepAwake = require('expo-keep-awake')
      const tag = 'textstack-reader'
      KeepAwake.activateKeepAwakeAsync?.(tag)
      deactivate = () => { try { KeepAwake.deactivateKeepAwake?.(tag) } catch { /* already released */ } }
    } catch {
      // Native module absent in this binary — read on, just without the lock.
      if (__DEV__) console.warn('[reader] keep-awake unavailable; screen may sleep')
    }
    return () => { deactivate?.() }
  }, [active])
}
