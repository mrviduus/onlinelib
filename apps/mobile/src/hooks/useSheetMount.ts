import { useEffect, useState } from 'react'

/**
 * Don't mount a sheet until it has been opened once.
 *
 * `<Modal visible={false}>` draws nothing, which reads like "it costs nothing".
 * It is not: the component AROUND the Modal mounts with its parent and its
 * hooks run immediately. Every screen that rendered `AddToCollectionSheet` or
 * `LibraryViewSheet` unconditionally therefore fired
 * `GET /me/library/collections` on open, from `useCollections`. On the public
 * book-detail screen — reachable signed out — that is a 401 on every single
 * open, because `useCollections` caches successes only; and it drags
 * `authFetch` into `onUnauthorized` → `handleTerminalAuthFailure()` on a screen
 * that never needed a session at all.
 *
 * Latched rather than a plain `open && <Sheet/>`: unmounting on close would
 * kill the slide-out animation the sheet was written for. After the first open
 * the component stays mounted and `visible` alone drives it, exactly as before.
 *
 * @param open the sheet's own visibility flag
 * @returns whether the sheet component should be rendered at all
 */
export function useSheetMount(open: boolean): boolean {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) setMounted(true)
  }, [open])
  return mounted
}
